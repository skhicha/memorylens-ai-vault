import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Navbar } from "./components/Navbar";
import { CommandPalette } from "./components/CommandPalette";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { VerifyEmailBanner } from "./components/VerifyEmailBanner";
import { AuthProvider } from "./lib/AuthContext";
import { useAuth } from "./lib/AuthContext";
import { LoginPage } from "./pages/Login";
import { RegisterPage } from "./pages/Register";
import { ForgotPasswordPage } from "./pages/ForgotPassword";
import { OAuthCallbackPage } from "./pages/OAuthCallback";
import { UploadPage } from "./pages/Upload";
import { LibraryPage } from "./pages/Library";
import { MediaDetailPage } from "./pages/MediaDetail";
import { TimelinePage } from "./pages/Timeline";
import { MapViewPage } from "./pages/MapView";
import { SearchPage } from "./pages/Search";
import { AskAIPage } from "./pages/AskAI";
import { DashboardPage } from "./pages/Dashboard";
import { SettingsPage } from "./pages/Settings";
import { AdminPage } from "./pages/Admin";

const AUTH_ROUTES = ["/login", "/register", "/forgot-password", "/oauth/callback"];

function AppShell() {
  const { user } = useAuth();
  const location = useLocation();
  const isAuthRoute = AUTH_ROUTES.includes(location.pathname);
  const showShell = !!user && !isAuthRoute;
  return (
    <div className="app-shell">
      {showShell && <Navbar />}
      {showShell && <CommandPalette />}
      <main className={isAuthRoute ? "app-main app-main-auth" : "app-main"}>
        {showShell && <VerifyEmailBanner />}
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/oauth/callback" element={<OAuthCallbackPage />} />
          <Route path="/" element={<Navigate to="/library" replace />} />
          <Route
            path="/upload"
            element={
              <ProtectedRoute>
                <UploadPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/library"
            element={
              <ProtectedRoute>
                <LibraryPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/media/:id"
            element={
              <ProtectedRoute>
                <MediaDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/timeline"
            element={
              <ProtectedRoute>
                <TimelinePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/map"
            element={
              <ProtectedRoute>
                <MapViewPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/search"
            element={
              <ProtectedRoute>
                <SearchPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/ask"
            element={
              <ProtectedRoute>
                <AskAIPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <SettingsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute requireAdmin>
                <AdminPage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/library" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}
