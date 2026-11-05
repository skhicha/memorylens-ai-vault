import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api, getAccessToken, setAccessToken, setRefreshHandler, type AuthUser } from "./api";

const STORAGE_KEY = "memorylens_access_token";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    // The refresh handler is used by the fetch wrapper to silently retry a
    // request once after a 401. It talks to /api/auth/refresh (which reads
    // the httpOnly refresh cookie) and updates the in-memory access token.
    setRefreshHandler(async () => {
      try {
        const res = await api.refresh();
        setAccessToken(res.access_token);
        localStorage.setItem(STORAGE_KEY, res.access_token);
        setUser(res.user);
        return res.access_token;
      } catch {
        setAccessToken(null);
        localStorage.removeItem(STORAGE_KEY);
        setUser(null);
        return null;
      }
    });

    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setAccessToken(stored);
      api
        .me()
        .then(setUser)
        .catch(() => {
          setAccessToken(null);
          localStorage.removeItem(STORAGE_KEY);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api.login(email, password);
    setAccessToken(res.access_token);
    localStorage.setItem(STORAGE_KEY, res.access_token);
    setUser(res.user);
  };

  const register = async (email: string, password: string, displayName: string) => {
    const res = await api.register(email, password, displayName);
    setAccessToken(res.access_token);
    localStorage.setItem(STORAGE_KEY, res.access_token);
    setUser(res.user);
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch {
      // ignore - clear local state regardless
    }
    setAccessToken(null);
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

// Exposed for edge cases (e.g. reading the token outside React).
export { getAccessToken };
