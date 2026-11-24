import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

export type Lang = 'en' | 'ta';
export type Role = 'farmer' | 'agent' | 'customer' | 'delivery_partner';

export interface Settings {
  lang: Lang;
  role: Role;
  onboarded: boolean;
  lengthUnit: 'cm' | 'in';
  /** weather alerts / heat stress / auto reminders on by default */
  weatherAlerts: boolean;
  lastSyncAt: string | null;
}

const DEFAULTS: Settings = {
  lang: 'en', role: 'farmer', onboarded: false, lengthUnit: 'cm', weatherAlerts: true, lastSyncAt: null,
};

const KEY = 'np.settings.v1';
let state: Settings = { ...DEFAULTS };
const listeners = new Set<() => void>();

export async function loadSettings(): Promise<Settings> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) state = { ...DEFAULTS, ...JSON.parse(raw) };
  } catch { /* corrupted storage: fall back to defaults */ }
  listeners.forEach(l => l());
  return state;
}

export function getSettings(): Settings { return state; }

export async function setSettings(patch: Partial<Settings>): Promise<void> {
  state = { ...state, ...patch };
  listeners.forEach(l => l());
  try { await AsyncStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, () => state, () => state);
}
