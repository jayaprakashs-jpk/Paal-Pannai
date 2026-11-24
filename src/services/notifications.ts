import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { kvGet, kvSet } from '../db/client';
import { list } from '../db/repo';
import { tNow } from '../i18n';
import { parseISODate } from '../lib/dates';

export const CHANNEL_ID = 'farm-reminders';
export const ALERT_CHANNEL_ID = 'farm-alerts';

let inited = false;

export async function initNotifications(): Promise<void> {
  if (inited) return;
  inited = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Farm reminders', importance: Notifications.AndroidImportance.HIGH, vibrationPattern: [0, 250, 250, 250],
    });
    await Notifications.setNotificationChannelAsync(ALERT_CHANNEL_ID, {
      name: 'Alerts (location, heat, weather)', importance: Notifications.AndroidImportance.MAX, vibrationPattern: [0, 400, 200, 400],
    });
  }
}

export async function ensureNotificationPermission(): Promise<boolean> {
  const cur = await Notifications.getPermissionsAsync();
  if (cur.granted) return true;
  if (!cur.canAskAgain) return false;
  const r = await Notifications.requestPermissionsAsync();
  return r.granted;
}

/** Immediate alert (pasture change, weather danger...). */
export async function notifyNow(title: string, body: string, channel = ALERT_CHANNEL_ID): Promise<void> {
  if (!(await ensureNotificationPermission())) return;
  await Notifications.scheduleNotificationAsync({
    content: { title, body, sound: true },
    trigger: Platform.OS === 'android' ? { channelId: channel, type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 1 } : null,
  });
}

async function cancelKey(key: string) {
  const raw = await kvGet(`notif.${key}`);
  if (!raw) return;
  try {
    for (const id of JSON.parse(raw) as string[]) await Notifications.cancelScheduledNotificationAsync(id);
  } catch { /* already gone */ }
  await kvSet(`notif.${key}`, null);
}

/** Schedules (or replaces) a one-time notification identified by `key`. Past dates are ignored. */
export async function scheduleOnce(key: string, when: Date, title: string, body: string): Promise<void> {
  await cancelKey(key);
  if (when.getTime() <= Date.now() + 5000) return;
  if (!(await ensureNotificationPermission())) return;
  const id = await Notifications.scheduleNotificationAsync({
    content: { title, body, sound: true },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when, channelId: ALERT_CHANNEL_ID },
  });
  await kvSet(`notif.${key}`, JSON.stringify([id]));
}

export async function cancelOnce(key: string): Promise<void> { await cancelKey(key); }

/** ISO date + hour -> local Date (e.g. a due date at 7:00 am). */
export function atHour(isoDate: string, hour: number, minute = 0): Date {
  const d = parseISODate(isoDate);
  d.setHours(hour, minute, 0, 0);
  return d;
}

// ------------ Daily reminders (feeding / water / medicine) ------------
export interface ReminderRow {
  id: string; kind: string; title: string; time_hhmm: string; days: string | null; enabled: boolean; animal_id?: string | null;
}

/** Ours: 1=Mon..7=Sun. Expo weekly trigger: 1=Sun..7=Sat. */
const toExpoWeekday = (d: number) => (d % 7) + 1;

export async function scheduleReminder(r: ReminderRow): Promise<void> {
  await cancelKey(`rem.${r.id}`);
  if (!r.enabled) return;
  if (!(await ensureNotificationPermission())) return;
  const [h, m] = r.time_hhmm.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return;
  const days = (r.days || '1,2,3,4,5,6,7').split(',').map(Number).filter(n => n >= 1 && n <= 7);
  const content = { title: r.title, body: tNow(reminderBody(r.kind)), sound: true };
  const ids: string[] = [];
  if (days.length === 7 || days.length === 0) {
    ids.push(await Notifications.scheduleNotificationAsync({
      content,
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: h, minute: m, channelId: CHANNEL_ID },
    }));
  } else {
    for (const d of days) {
      ids.push(await Notifications.scheduleNotificationAsync({
        content,
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: toExpoWeekday(d), hour: h, minute: m, channelId: CHANNEL_ID,
        },
      }));
    }
  }
  await kvSet(`notif.rem.${r.id}`, JSON.stringify(ids));
}

export async function cancelReminder(id: string): Promise<void> { await cancelKey(`rem.${id}`); }

function reminderBody(kind: string): string {
  switch (kind) {
    case 'feed': return 'Time to feed your animals';
    case 'water': return 'Check water for your animals';
    case 'medicine': return 'Medicine time';
    default: return 'Farm reminder';
  }
}

/** Re-creates every reminder. Safe to call on each app start (alarms can be lost after updates / data clears). */
export async function rescheduleAllReminders(): Promise<void> {
  const rows = await list<ReminderRow>('reminders');
  for (const r of rows) {
    try { await scheduleReminder(r); } catch { /* one bad reminder must not block the rest */ }
  }
}
