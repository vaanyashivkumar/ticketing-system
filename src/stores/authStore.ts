import { create } from 'zustand';
import type { Session, StaticPermission } from '@domain/types/auth.types';
import { AuthService } from '@services/AuthService';
import { AuthApi } from '@services/api/authApi';
import { USE_API } from '@config/runtime.config';
import { canStatic } from '@domain/permission/can';

/**
 * Auth store (Zustand). Holds the session as an IN-MEMORY MIRROR only
 * (FRONTEND_ARCHITECTURE §A5) — persistence belongs to AuthService (prototype mode) or to the
 * bearer token (API mode).
 *
 * ASYNC BY NECESSITY. Every action returns a Promise now, because in API mode each is a network
 * round-trip. The prototype path stays synchronous underneath and simply resolves immediately, so
 * the interface is shared and components branch on DATA, never on data source.
 */
interface AuthState {
  session: Session | null;
  status: 'loading' | 'authenticated' | 'anonymous';

  bootstrap: () => Promise<void>;
  /** Prototype sign-in: picking a seeded identity. No password exists in this mode. */
  login: (userId: string) => Promise<boolean>;
  /** API sign-in: real credential verification. */
  loginWithPassword: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;

  isAuthenticated: () => boolean;
  can: (permission: StaticPermission) => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  status: 'loading',

  bootstrap: async () => {
    const restored = USE_API ? await AuthApi.restore() : AuthService.restore();
    set(restored
      ? { session: restored, status: 'authenticated' }
      : { session: null, status: 'anonymous' });
  },

  login: async (userId) => {
    // Refused rather than silently ignored: in API mode there is no way to become an identity
    // without proving it, and quietly succeeding here would be a fake authentication path.
    if (USE_API) return false;
    const session = AuthService.authenticate(userId);
    if (!session) return false;
    set({ session, status: 'authenticated' });
    return true;
  },

  loginWithPassword: async (email, password) => {
    if (!USE_API) return { ok: false, error: 'Password sign-in requires the API.' };
    const r = await AuthApi.login(email, password);
    if (!r.ok) return { ok: false, error: r.error };
    set({ session: r.session, status: 'authenticated' });
    return { ok: true };
  },

  logout: async () => {
    if (USE_API) await AuthApi.logout();
    else AuthService.logout(get().session?.user.id ?? null);
    set({ session: null, status: 'anonymous' });
  },

  isAuthenticated: () => get().status === 'authenticated' && get().session !== null,

  can: (permission) => {
    const session = get().session;
    return session ? canStatic(session, permission) : false;
  },
}));
