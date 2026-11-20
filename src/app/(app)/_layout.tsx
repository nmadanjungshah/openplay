import { Stack } from 'expo-router';

import { Brand, FontFamily } from '@/constants/theme';

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerBackButtonDisplayMode: 'minimal',
        headerShadowVisible: false,
        // Navy header that runs straight into each screen's <Hero>.
        headerStyle: { backgroundColor: Brand.ink },
        headerTintColor: '#FFFFFF',
        headerTitleStyle: { fontFamily: FontFamily.displayBold, fontSize: 20 },
      }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'Home' }} />
      <Stack.Screen name="session/[id]" options={{ title: 'Session' }} />
      <Stack.Screen name="group/new" options={{ title: 'New group', presentation: 'modal' }} />
      <Stack.Screen name="group/[id]/index" options={{ title: 'Group' }} />
      <Stack.Screen name="group/[id]/new-session" options={{ title: 'New session', presentation: 'modal' }} />
      <Stack.Screen name="group/[id]/payments" options={{ title: 'Payment settings' }} />
      <Stack.Screen name="join/[code]" options={{ title: 'Join group' }} />
    </Stack>
  );
}
