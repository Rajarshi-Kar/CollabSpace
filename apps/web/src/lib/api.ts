import { useAuthStore } from '../stores/auth';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown) {
    super(typeof body === 'object' && body && 'error' in body ? String((body as { error: unknown }).error) : `Request failed (${status})`);
    this.status = status;
    this.body = body;
  }
}

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const { refreshToken, setAccessToken, clear } = useAuthStore.getState();
  if (!refreshToken) return null;

  const res = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) {
    clear();
    return null;
  }
  const { accessToken } = (await res.json()) as { accessToken: string };
  setAccessToken(accessToken);
  return accessToken;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
}

// Single fetch wrapper: attaches the access token, retries once through a
// deduplicated refresh on 401 (so N concurrent requests hitting an expired
// token trigger one refresh call, not N), and normalizes error responses
// into ApiError so callers can branch on status without re-parsing JSON.
export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query } = options;

  const url = new URL(`${API_URL}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }

  const doFetch = async (token: string | null) => {
    const res = await fetch(url.toString(), {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return res;
  };

  let token = useAuthStore.getState().accessToken;
  let res = await doFetch(token);

  if (res.status === 401 && useAuthStore.getState().refreshToken) {
    refreshPromise ??= refreshAccessToken().finally(() => {
      refreshPromise = null;
    });
    token = await refreshPromise;
    if (token) res = await doFetch(token);
  }

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new ApiError(res.status, errorBody);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
