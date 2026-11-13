import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Camera, LogIn, ShieldCheck, Images, Search, Users, MapPin } from "lucide-react";
import { useAuth } from "../lib/AuthContext";
import "./Auth.css";

const RESEND_COOLDOWN_SECONDS = 30;

const FEATURES = [
  { icon: Images, text: "One vault for every photo and video, automatically organized" },
  { icon: Users, text: "Face detection groups the people in your memories" },
  { icon: Search, text: "Full-text search across filenames, tags, and video transcripts" },
  { icon: MapPin, text: "A map and timeline of where and when it all happened" },
];

function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-shell">
      <div className="auth-layout">
        <div className="auth-brand-panel">
          <div className="auth-logo">
            <Camera size={22} />
          </div>
          <h1 className="auth-brand-title">MemoryLens AI</h1>
          <p className="auth-brand-tagline">Your personal media vault — searchable, geotagged, and understood.</p>
          <ul className="auth-feature-list">
            {FEATURES.map(({ icon: Icon, text }) => (
              <li key={text}>
                <Icon size={16} />
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="auth-card-col">{children}</div>
      </div>
    </div>
  );
}

export function LoginPage() {
  const { login, completeOtpLogin, resendOtp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [otpToken, setOtpToken] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [otpError, setOtpError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const cooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const locationState = location.state as { from?: string; resetSuccess?: boolean } | null;
  const from = locationState?.from ?? "/library";
  // Captured once on mount so the banner survives this single render pass;
  // the router state itself is cleared right after so a later back/forward
  // navigation to this same history entry, or any subsequent unrelated
  // login attempt, doesn't resurrect it.
  const [resetSuccess] = useState(() => locationState?.resetSuccess ?? false);

  useEffect(() => {
    return () => {
      if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    };
  }, []);

  useEffect(() => {
    if (locationState?.resetSuccess) {
      navigate(location.pathname, { replace: true, state: { from: locationState.from } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startCooldown = () => {
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
    if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    cooldownTimer.current = setInterval(() => {
      setResendCooldown((s) => {
        if (s <= 1) {
          if (cooldownTimer.current) clearInterval(cooldownTimer.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const outcome = await login(email, password);
      if (outcome.status === "otp_required") {
        setOtpToken(outcome.otpToken);
        startCooldown();
      } else {
        navigate(from, { replace: true });
      }
    } catch (err) {
      setError((err as Error).message.replace(/^\d+\s*/, "") || "Login failed");
    } finally {
      setSubmitting(false);
    }
  };

  const onVerifyOtp = async (e: FormEvent) => {
    e.preventDefault();
    if (!otpToken) return;
    setOtpError(null);
    setVerifying(true);
    try {
      await completeOtpLogin(otpToken, code);
      navigate(from, { replace: true });
    } catch (err) {
      setOtpError((err as Error).message.replace(/^\d+\s*/, "") || "Invalid code");
    } finally {
      setVerifying(false);
    }
  };

  const onResend = async () => {
    if (!otpToken || resendCooldown > 0) return;
    setOtpError(null);
    try {
      await resendOtp(otpToken);
      startCooldown();
    } catch (err) {
      setOtpError((err as Error).message.replace(/^\d+\s*/, "") || "Could not resend code");
    }
  };

  const backToPassword = () => {
    setOtpToken(null);
    setCode("");
    setOtpError(null);
    if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    setResendCooldown(0);
  };

  if (otpToken) {
    return (
      <AuthLayout>
        <div className="auth-card glass-card">
          <div className="auth-logo">
            <ShieldCheck size={22} />
          </div>
          <h1>Enter your code</h1>
          <p className="auth-subtitle">Enter the 6-digit code sent to your email.</p>

          {otpError && <div className="auth-error">{otpError}</div>}

          <form onSubmit={onVerifyOtp}>
            <div className="auth-field">
              <label htmlFor="otp-code">Verification code</label>
              <input
                id="otp-code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                autoComplete="one-time-code"
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              />
            </div>
            <button type="submit" className="btn btn-primary auth-submit" disabled={verifying || code.length < 6}>
              <LogIn size={16} />
              {verifying ? "Verifying…" : "Verify"}
            </button>
          </form>

          <div className="auth-footer">
            <button type="button" className="auth-link-btn" onClick={onResend} disabled={resendCooldown > 0}>
              {resendCooldown > 0 ? `Resend code (${resendCooldown}s)` : "Resend code"}
            </button>
            {" · "}
            <button type="button" className="auth-link-btn" onClick={backToPassword}>
              Back
            </button>
          </div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="auth-card glass-card">
        <div className="auth-logo">
          <Camera size={22} />
        </div>
        <h1>Welcome back</h1>
        <p className="auth-subtitle">Sign in to your MemoryLens AI vault.</p>

        {resetSuccess && <div className="auth-success">Password reset. Sign in with your new password.</div>}
        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={onSubmit}>
          <div className="auth-field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="auth-field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button type="submit" className="btn btn-primary auth-submit" disabled={submitting}>
            <LogIn size={16} />
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="auth-footer">
          <Link to="/forgot-password">Forgot password?</Link>
        </div>
        <div className="auth-footer">
          Don't have an account? <Link to="/register">Create one</Link>
        </div>
      </div>
    </AuthLayout>
  );
}
