export const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
export const wsUrl = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:4000/ws';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
  cookie?: string;
};

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, cookie, headers, ...rest } = options;

  const response = await fetch(`${apiUrl}${path}`, {
    ...rest,
    credentials: 'include',
    cache: 'no-store',
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new ApiError(
      response.status,
      payload?.error ?? 'request_failed',
      payload?.message ?? 'request failed',
      payload?.details,
    );
  }

  return payload as T;
}
