import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

const tokenKey = 'helpdesk_session_token';

export const apiUrl =
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ?? 'http://localhost:4000';

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function saveToken(token: string) {
  await SecureStore.setItemAsync(tokenKey, token);
}

export async function readToken() {
  return SecureStore.getItemAsync(tokenKey);
}

export async function clearToken() {
  await SecureStore.deleteItemAsync(tokenKey);
}

export async function apiFetch<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const token = await readToken();
  const response = await fetch(`${apiUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new ApiError(response.status, payload?.message ?? 'request failed');
  }
  return payload as T;
}
