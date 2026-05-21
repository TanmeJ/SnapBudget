export interface AuthUser {
  id: number;
  email: string;
  created_at: string;
}

export interface AuthSession {
  user: AuthUser;
  access_token: string;
}

const AUTH_STORAGE_KEY = 'rupeeocr.auth.session';

export function getStoredSession(): AuthSession | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const session = JSON.parse(raw) as Partial<AuthSession>;
    if (!session?.user || !session?.access_token) {
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
      return null;
    }
    return session as AuthSession;
  } catch {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    return null;
  }
}

export function saveSession(session: AuthSession): void {
  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
}

export function getAuthHeaders(session?: AuthSession | null): HeadersInit {
  const activeSession = session ?? getStoredSession();
  if (!activeSession) {
    return {};
  }

  return {
    Authorization: `Bearer ${activeSession.access_token}`,
  };
}
