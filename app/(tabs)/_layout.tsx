import React from 'react';
import { Tabs } from 'expo-router';
import { Icon } from '../../src/ui';
import { C } from '../../src/ui/theme';
import { useT } from '../../src/i18n';
import { LangToggle } from '../../src/ui/LangToggle';
import { useSettings } from '../../src/store/settings';

export default function TabsLayout() {
  const t = useT();
  const { role } = useSettings();
  const farmerLike = role === 'farmer' || role === 'agent';
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: C.primary },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
        headerRight: () => <LangToggle />,
        tabBarActiveTintColor: C.primary,
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        tabBarStyle: { height: 62, paddingBottom: 6 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('Home'), tabBarIcon: ({ color }) => <Icon name="home" color={color} /> }} />
      <Tabs.Screen name="animals" options={{
        title: t('Animals'), href: farmerLike ? undefined : null,
        tabBarIcon: ({ color }) => <Icon name="cow" color={color} />,
      }} />
      <Tabs.Screen name="milk" options={{
        title: t('Milk'), href: farmerLike ? undefined : null,
        tabBarIcon: ({ color }) => <Icon name="cup-water" color={color} />,
      }} />
      <Tabs.Screen name="market" options={{ title: t('Market'), tabBarIcon: ({ color }) => <Icon name="storefront" color={color} /> }} />
      <Tabs.Screen name="more" options={{ title: t('More'), tabBarIcon: ({ color }) => <Icon name="dots-grid" color={color} /> }} />
    </Tabs>
  );
}
