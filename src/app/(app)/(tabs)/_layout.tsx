import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router/js-tabs';
import { Platform } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

export default function TabsLayout() {
  const c = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.textSecondary,
        tabBarStyle: {
          backgroundColor: c.surface,
          borderTopColor: c.border,
          // Web has no safe-area inset, and the default height clips the labels.
          ...(Platform.OS === 'web' ? { height: 62 } : null),
        },
        // On web each tab item is fixed at the default height, which pushes the label out of view.
        tabBarItemStyle: Platform.OS === 'web' ? { height: 60, paddingTop: 6, paddingBottom: 6 } : undefined,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Play',
          tabBarIcon: ({ color, size }) => <Ionicons name="tennisball-outline" size={size} color={String(color)} />,
        }}
      />
      <Tabs.Screen
        name="groups"
        options={{
          title: 'Groups',
          tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" size={size} color={String(color)} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <Ionicons name="person-circle-outline" size={size} color={String(color)} />,
        }}
      />
    </Tabs>
  );
}
