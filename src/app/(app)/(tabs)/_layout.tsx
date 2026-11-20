import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router/js-tabs';
import type { ComponentProps } from 'react';
import { Platform, View } from 'react-native';

import { FontFamily } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

function TabIcon({ name, focused, color, size }: { name: IconName; focused: boolean; color: string; size: number }) {
  const c = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: 3 }}>
      {/* Active marker: a short bar like a scoreboard indicator */}
      <View style={{ width: 18, height: 3, borderRadius: 2, backgroundColor: focused ? c.tint : 'transparent' }} />
      <Ionicons name={focused ? name : (`${name}-outline` as IconName)} size={size - 2} color={color} />
    </View>
  );
}

export default function TabsLayout() {
  const c = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.tint,
        tabBarInactiveTintColor: c.textSecondary,
        tabBarLabelStyle: { fontFamily: FontFamily.bodyBold, fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase' },
        tabBarStyle: {
          backgroundColor: c.surface,
          borderTopColor: c.border,
          // Web has no safe-area inset, and the default height clips the labels.
          ...(Platform.OS === 'web' ? { height: 66 } : null),
        },
        // On web each tab item is fixed at the default height, which pushes the label out of view.
        tabBarItemStyle: Platform.OS === 'web' ? { height: 64, paddingTop: 4, paddingBottom: 6 } : undefined,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Play',
          tabBarIcon: ({ color, size, focused }) => <TabIcon name="tennisball" focused={focused} color={String(color)} size={size} />,
        }}
      />
      <Tabs.Screen
        name="groups"
        options={{
          title: 'Groups',
          tabBarIcon: ({ color, size, focused }) => <TabIcon name="people" focused={focused} color={String(color)} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size, focused }) => <TabIcon name="person-circle" focused={focused} color={String(color)} size={size} />,
        }}
      />
    </Tabs>
  );
}
