import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { tNow } from '../i18n';

/** Runs an async loader on screen focus (so lists refresh after returning from a form). */
export function useLoad<T>(loader: () => Promise<T>, initial: T, deps: any[] = []): {
  data: T; loading: boolean; reload: () => Promise<void>; error: string | null;
} {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const run = useCallback(async () => {
    try {
      const r = await loader();
      if (alive.current) { setData(r); setError(null); }
    } catch (e: any) {
      if (alive.current) setError(String(e?.message ?? e));
    } finally {
      if (alive.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useFocusEffect(useCallback(() => { run(); }, [run]));
  return { data, loading, reload: run, error };
}

/** Submit guard: a double-tap cannot save twice, and a thrown error is shown instead of vanishing. */
export function useBusy() {
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (e: any) {
      Alert.alert(tNow('Something went wrong'), String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }, [busy]);
  return { busy, run };
}
