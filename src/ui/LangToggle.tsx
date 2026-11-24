import React from 'react';
import { Pressable, Text } from 'react-native';
import { setSettings, useSettings } from '../store/settings';
import { C } from './theme';

/** One-tap English <-> Tamil switch, shown in every tab header. */
export function LangToggle() {
  const { lang } = useSettings();
  return (
    <Pressable
      onPress={() => setSettings({ lang: lang === 'en' ? 'ta' : 'en' })}
      style={{ backgroundColor: C.white, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 5, marginRight: 12 }}
      accessibilityLabel="Switch language"
    >
      <Text style={{ color: C.primary, fontWeight: '800' }}>{lang === 'en' ? 'தமிழ்' : 'EN'}</Text>
    </Pressable>
  );
}
