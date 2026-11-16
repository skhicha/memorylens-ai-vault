import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";

export function ProtectedRoute({
  children,
  requireAdmin = false,
  blockRoles = [],
}: {
  children: ReactNode;
  requireAdmin?: boolean;
  blockRoles?: string[];
}) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="empty-state">Loading…</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (requireAdmin && user.role !== "admin") {
    return <Navigate to="/library" replace />;
  }

  if (blockRoles.includes(user.role)) {
    return <Navigate to="/library" replace />;
  }

  return <>{children}</>;
}
