import { useSyncExternalStore } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

let session: Session | null = null;
let ready = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

export async function initAuth(): Promise<void> {
  if (!supabase) { ready = true; emit(); return; }
  try {
    const { data } = await supabase.auth.getSession();
    session = data.session;
  } catch { session = null; }
  ready = true;
  supabase.auth.onAuthStateChange((_evt, s) => { session = s; emit(); });
  emit();
}

export const getSession = () => session;
export const getUserId = () => session?.user?.id ?? null;

export function useSession() {
  return useSyncExternalStore(
    cb => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => session,
    () => session,
  );
}
export const authReady = () => ready;

export async function signUp(email: string, password: string): Promise<string | null> {
  if (!supabase) return 'Cloud is not set up';
  const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
  if (error) return error.message;
  // With email confirmation ON there is no session yet.
  if (!data.session) return 'Check your email to confirm your account, then sign in.';
  return null;
}

export async function signIn(email: string, password: string): Promise<string | null> {
  if (!supabase) return 'Cloud is not set up';
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  return error ? error.message : null;
}

export async function signOut(): Promise<void> {
  if (supabase) await supabase.auth.signOut();
}
