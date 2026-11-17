import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import {
  api,
  getAccessToken,
  isMfaRequired,
  isOtpRequired,
  setAccessToken,
  setRefreshHandler,
  type AuthUser,
} from "./api";

const STORAGE_KEY = "memorylens_access_token";

// Discriminated login result: login completed, or the account needs an
// OTP code (email), or an MFA code (authenticator app). The Login page
// drives the relevant UI off this, not AuthContext.
export type LoginOutcome =
  | { status: "logged_in" }
  | { status: "otp_required"; otpToken: string }
  | { status: "mfa_required"; mfaToken: string };

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  permissions: string[];
  hasPermission: (code: string) => boolean;
  login: (email: string, password: string) => Promise<LoginOutcome>;
  completeOtpLogin: (otpToken: string, code: string) => Promise<void>;
  resendOtp: (otpToken: string) => Promise<void>;
  completeMfaLogin: (mfaToken: string, code: string) => Promise<void>;
  completeOAuthLogin: (accessToken: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Fetches the current user's permission list, best-effort. Used right
// after every place a user is set, so `permissions` always matches
// whichever user is currently logged in. Failure here shouldn't block
// login -- it just means permission-gated UI falls back to hidden until
// the next successful fetch (e.g. on reload).
async function fetchPermissions(): Promise<string[]> {
  try {
    const res = await api.myPermissions();
    return res.permissions;
  } catch {
    return [];
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
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
        fetchPermissions().then(setPermissions);
        return res.access_token;
      } catch {
        setAccessToken(null);
        localStorage.removeItem(STORAGE_KEY);
        setUser(null);
        setPermissions([]);
        return null;
      }
    });

    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setAccessToken(stored);
      api
        .me()
        .then((u) => {
          setUser(u);
          return fetchPermissions().then(setPermissions);
        })
        .catch(() => {
          setAccessToken(null);
          localStorage.removeItem(STORAGE_KEY);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email: string, password: string): Promise<LoginOutcome> => {
    const res = await api.login(email, password);
    if (isMfaRequired(res)) {
      return { status: "mfa_required", mfaToken: res.mfa_token };
    }
    if (isOtpRequired(res)) {
      return { status: "otp_required", otpToken: res.otp_token };
    }
    setAccessToken(res.access_token);
    localStorage.setItem(STORAGE_KEY, res.access_token);
    setUser(res.user);
    setPermissions(await fetchPermissions());
    return { status: "logged_in" };
  };

  const completeOtpLogin = async (otpToken: string, code: string) => {
    const res = await api.otpVerify(otpToken, code);
    setAccessToken(res.access_token);
    localStorage.setItem(STORAGE_KEY, res.access_token);
    setUser(res.user);
    setPermissions(await fetchPermissions());
  };

  const resendOtp = async (otpToken: string) => {
    await api.otpResend(otpToken);
  };

  const completeMfaLogin = async (mfaToken: string, code: string) => {
    const res = await api.mfaVerify(mfaToken, code);
    setAccessToken(res.access_token);
    localStorage.setItem(STORAGE_KEY, res.access_token);
    setUser(res.user);
    setPermissions(await fetchPermissions());
  };

  // Used by the Google OAuth callback page: the backend redirect only
  // carries the access token (the refresh token already arrived as an
  // httpOnly cookie on that same redirect), so this just adopts it and
  // fetches the user profile, mirroring what AuthResponse normally gives.
  const completeOAuthLogin = async (accessToken: string) => {
    setAccessToken(accessToken);
    localStorage.setItem(STORAGE_KEY, accessToken);
    const fresh = await api.me();
    setUser(fresh);
    setPermissions(await fetchPermissions());
  };

  const refreshUser = async () => {
    const fresh = await api.me();
    setUser(fresh);
    setPermissions(await fetchPermissions());
  };

  const register = async (email: string, password: string, displayName: string) => {
    const res = await api.register(email, password, displayName);
    setAccessToken(res.access_token);
    localStorage.setItem(STORAGE_KEY, res.access_token);
    setUser(res.user);
    setPermissions(await fetchPermissions());
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
    setPermissions([]);
  };

  const hasPermission = (code: string) => permissions.includes(code);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        permissions,
        hasPermission,
        login,
        completeOtpLogin,
        resendOtp,
        completeMfaLogin,
        completeOAuthLogin,
        register,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

// Exposed for edge cases (e.g. reading the token outside React).
export { getAccessToken };
