import { useAuthStore } from '@stores/authStore';

/** Session + identity access for components. Behaviour lives in the store/service. */
export function useAuth() {
  const session = useAuthStore((s) => s.session);
  const status = useAuthStore((s) => s.status);
  const login = useAuthStore((s) => s.login);
  const logout = useAuthStore((s) => s.logout);
  return {
    session,
    user: session?.user ?? null,
    status,
    isAuthenticated: status === 'authenticated' && session !== null,
    login,
    logout,
  };
}
