import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { apiFetch } from './api';

let currentToken: string | null = null;

export async function registerForPush() {
  try {
    const existing = await Notifications.getPermissionsAsync();
    const granted = existing.granted || (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) {
      return null;
    }

    const result = await Notifications.getExpoPushTokenAsync();
    currentToken = result.data;

    await apiFetch('/devices/push-token', {
      method: 'POST',
      body: { token: currentToken, platform: Platform.OS === 'ios' ? 'ios' : 'android' },
    });
    return currentToken;
  } catch {
    return null;
  }
}

export async function unregisterPush() {
  if (!currentToken) {
    return;
  }
  await apiFetch(`/devices/push-token/${encodeURIComponent(currentToken)}`, {
    method: 'DELETE',
  }).catch(() => undefined);
  currentToken = null;
}
