import { API_BASE_URL, TOKEN_STORAGE_KEY } from '@config/runtime.config';

/**
 * The HTTP client. One place that knows about the network, so no component or store ever calls
 * `fetch` directly.
 *
 * Every method returns the same `ServiceResult`-shaped union the existing services return, so
 * callers keep the branching they already have. What changes for a caller is only that the value
 * arrives in a Promise — not the shape of success or failure.
 */
export type ApiResult<T> = { ok: true; value: T } | { ok: false; error: string; status: number };

let token: string | null = null;

/** Restore the token on boot — a page refresh must not sign the user out. */
export function loadToken(): string | null {
  if (token === null) token = localStorage.getItem(TOKEN_STORAGE_KEY);
  return token;
}

export function setToken(next: string | null): void {
  token = next;
  if (next) localStorage.setItem(TOKEN_STORAGE_KEY, next);
  else localStorage.removeItem(TOKEN_STORAGE_KEY);
}

/**
 * Map a failed response to a message a human can act on.
 *
 * The API deliberately distinguishes 401/403/404/409/422, and that distinction is worth
 * preserving here: "someone else moved this ticket" (409) and "you may not do this" (403) call
 * for different responses from the user, and collapsing them into "Request failed" throws away
 * the work the backend did to tell them apart.
 */
function messageFor(status: number, body: { error?: string } | null): string {
  if (body?.error) return body.error;
  switch (status) {
    case 401: return 'Your session has expired. Please sign in again.';
    case 403: return 'You do not have permission to do that.';
    case 404: return 'That item could not be found.';
    case 409: return 'This has changed since you loaded it. Refresh and try again.';
    case 422: return 'That change was rejected. Check the details and try again.';
    case 501: return 'That feature is not available yet.';
    default: return 'Something went wrong. Please try again.';
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  parse: (body: unknown) => T = (b) => b as T,
): Promise<ApiResult<T>> {
  const auth = loadToken();
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(auth ? { authorization: `Bearer ${auth}` } : {}),
        ...init.headers,
      },
    });
  } catch {
    // A network failure is NOT the same as a rejection — say so, rather than implying the
    // server refused the request.
    return { ok: false, error: 'Cannot reach the server. Check your connection.', status: 0 };
  }

  if (res.status === 204) return { ok: true, value: undefined as T };

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    /**
     * A 401 means the token is dead — expired, revoked by logout elsewhere, or the account was
     * deactivated. Clearing it here means the app cannot sit in a zombie state where it believes
     * it is signed in while every request fails.
     */
    if (res.status === 401) setToken(null);
    return { ok: false, error: messageFor(res.status, body), status: res.status };
  }

  return { ok: true, value: parse(body) };
}

export const api = {
  get: <T>(path: string, parse?: (b: unknown) => T) => request<T>(path, { method: 'GET' }, parse),
  post: <T>(path: string, body?: unknown, parse?: (b: unknown) => T) =>
    request<T>(path, { method: 'POST', ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }, parse),
  patch: <T>(path: string, body: unknown, parse?: (b: unknown) => T) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }, parse),
  /**
   * PUT, for configuration documents that are replaced whole rather than merged. §6.4 specifies
   * PUT for `/config/sla` and `/config/org` precisely because a partial SLA policy is not a
   * meaningful thing to send — the priorities are a set that has to stay internally ordered.
   */
  put: <T>(path: string, body: unknown, parse?: (b: unknown) => T) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }, parse),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
