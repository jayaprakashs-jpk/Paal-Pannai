import React, { useEffect, useState } from 'react';
import { AppState, View, ActivityIndicator, Text } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { getDb } from '../src/db/client';
import { loadSettings } from '../src/store/settings';
import { initAuth } from '../src/services/auth';
import { initNotifications, rescheduleAllReminders } from '../src/services/notifications';
import { startAutoSync, syncNow } from '../src/services/sync';
import { useSession } from '../src/services/auth';
import { supabase } from '../src/services/supabase';
import { C } from '../src/ui/theme';

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        await loadSettings();
        await getDb();
        await initAuth();
        await initNotifications();
        setReady(true);
        rescheduleAllReminders().catch(() => {});
      } catch (e: any) {
        setFatal(String(e?.message ?? e));
      }
    })();
  }, []);

  useEffect(() => startAutoSync(), []);

  // Sync right after sign-in, and whenever the app comes back to the foreground.
  const session = useSession();
  useEffect(() => { if (ready && session) syncNow().catch(() => {}); }, [ready, session?.user.id]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => { if (s === 'active') syncNow().catch(() => {}); });
    return () => sub.remove();
  }, []);

  // Keep the cloud login fresh only while the app is open
  useEffect(() => {
    if (!supabase) return;
    const sub = AppState.addEventListener('change', s => {
      if (s === 'active') supabase!.auth.startAutoRefresh();
      else supabase!.auth.stopAutoRefresh();
    });
    supabase.auth.startAutoRefresh();
    return () => sub.remove();
  }, []);

  if (fatal) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
        <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 8 }}>Could not open the app database</Text>
        <Text>{fatal}</Text>
      </View>
    );
  }
  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#fff" size="large" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: C.primary },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: C.bg },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </SafeAreaProvider>
  );
}
