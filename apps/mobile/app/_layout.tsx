import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider } from '@/session';
import { theme } from '@/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: theme.surface },
            headerTintColor: theme.text,
            contentStyle: { backgroundColor: theme.background },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ title: 'Sign in' }} />
          <Stack.Screen name="inbox/index" options={{ title: 'Inbox' }} />
          <Stack.Screen name="inbox/[id]" options={{ title: 'Conversation' }} />
        </Stack>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
