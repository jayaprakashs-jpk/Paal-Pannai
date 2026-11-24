import { addDays, fmtDate, isoToLocalDate, today } from '../lib/dates';
import { dryOffDate, expectedDelivery, nextHeatAfterFailure, nextHeatWindow, profileFor } from '../lib/breeding';
import { Row, update } from '../db/repo';
import { atHour, cancelOnce, scheduleOnce } from './notifications';
import { tNow } from '../i18n';

/** Turns a breeding event's status into the right phone alerts. Call after every save / status change. */
export async function applyBreedingAlerts(event: Row, animal: Row): Promise<void> {
  const species = animal.species as string;
  const p = profileFor(species);
  const name = animal.nickname as string;
  const serviceDate = isoToLocalDate(event.done_at);
  const keys = ['watch', 'exp', 'check', 'deliver', 'dryoff'].map(k => `breed.${event.id}.${k}`);
  for (const k of keys) await cancelOnce(k);
  if (!p) return;

  if (event.status === 'pending') {
    const w = nextHeatWindow(species, serviceDate)!;
    await scheduleOnce(`breed.${event.id}.watch`, atHour(w.start, 7), tNow('Watch for heat (Paruvam)'),
      tNow('{name}: return-to-heat window starts today. If she comes in heat, the service may have failed.', { name }));
    await scheduleOnce(`breed.${event.id}.exp`, atHour(w.expected, 7), tNow('Heat expected today'),
      tNow('{name}: next heat is expected today if she did not conceive.', { name }));
    await scheduleOnce(`breed.${event.id}.check`, atHour(addDays(serviceDate, p.confirmDays), 8), tNow('Pregnancy check due'),
      tNow('{name}: ask the vet to confirm pregnancy now.', { name }));
    await update('breeding_events', event.id, {
      expected_heat_date: w.expected, expected_delivery_date: expectedDelivery(species, serviceDate),
    });
  } else if (event.status === 'confirmed') {
    const due = expectedDelivery(species, serviceDate)!;
    await scheduleOnce(`breed.${event.id}.deliver`, atHour(addDays(due, -7), 8), tNow('Delivery in 1 week'),
      tNow('{name}: expected delivery on {date}. Prepare a clean shed.', { name, date: fmtDate(due) }));
    const dry = dryOffDate(species, due);
    if (dry) {
      await scheduleOnce(`breed.${event.id}.dryoff`, atHour(dry, 8), tNow('Dry-off time'),
        tNow('{name}: stop milking now (60 days before calving).', { name }));
    }
    await update('breeding_events', event.id, { expected_delivery_date: due, expected_heat_date: null });
  } else if (event.status === 'failed') {
    const w = nextHeatAfterFailure(species, serviceDate, today());
    if (w) {
      await scheduleOnce(`breed.${event.id}.watch`, atHour(w.start, 7), tNow('Next heat (Paruvam) window'),
        tNow('{name}: next heat window starts today. Plan insemination.', { name }));
      await scheduleOnce(`breed.${event.id}.exp`, atHour(w.expected, 7), tNow('Heat expected today'),
        tNow('{name}: next heat is expected today.', { name }));
      await update('breeding_events', event.id, { expected_heat_date: w.expected, expected_delivery_date: null });
    }
  }
}

export async function applyHealthAlert(rec: Row, animal: Row | null): Promise<void> {
  const key = `health.${rec.id}`;
  await cancelOnce(key);
  if (!rec.next_due_date) return;
  const name = animal?.nickname ?? '';
  const dayBefore = addDays(rec.next_due_date, -1);
  const when = dayBefore >= today() ? dayBefore : rec.next_due_date;
  await scheduleOnce(key, atHour(when, 8), tNow('{title} due soon', { title: rec.title }),
    tNow('{name}: due on {date}', { name, date: fmtDate(rec.next_due_date) }));
}
