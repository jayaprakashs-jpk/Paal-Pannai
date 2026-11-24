import React from 'react';
import { Stack } from 'expo-router';

/** Sets the header title for the current screen (already translated by the caller). */
export function Title({ children, right }: { children: string; right?: () => React.ReactNode }) {
  return <Stack.Screen options={{ title: children, headerRight: right }} />;
}
