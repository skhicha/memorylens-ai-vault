import { useEffect, useState } from "react";
import { ShieldCheck, Users, Images, UserCog } from "lucide-react";
import { api, type AdminStats, type AdminUser } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import { TableSkeleton } from "../components/Skeleton";
import "./Admin.css";

type Role = "admin" | "editor" | "viewer";

interface PendingAction {
  user: AdminUser;
  kind: "deactivate" | "reactivate" | "role";
  newRole?: Role;
}

const ACTION_COPY: Record<PendingAction["kind"], { title: string; body: (u: AdminUser, newRole?: Role) => string }> = {
  deactivate: {
    title: "Deactivate user",
    body: (u) => `${u.display_name} (${u.email}) will no longer be able to log in. Continue?`,
  },
  reactivate: {
    title: "Reactivate user",
    body: (u) => `${u.display_name} (${u.email}) will be able to log in again. Continue?`,
  },
  role: {
    title: "Change role",
    body: (u, newRole) => `${u.display_name} (${u.email}) will become '${newRole}'. Continue?`,
  },
};

export function AdminPage() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [acting, setActing] = useState(false);

  const load = async () => {
    try {
      const [usersRes, statsRes] = await Promise.all([api.adminListUsers(), api.adminStats()]);
      setUsers(usersRes.users);
      setStats(statsRes);
    } catch (err) {
      setError((err as Error).message.replace(/^\d+\s*/, "") || "Could not load admin data");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const confirmAction = async () => {
    if (!pending) return;
    setActing(true);
    try {
      if (pending.kind === "deactivate") await api.adminDeactivate(pending.user.id);
      if (pending.kind === "reactivate") await api.adminReactivate(pending.user.id);
      if (pending.kind === "role" && pending.newRole) await api.adminSetRole(pending.user.id, pending.newRole);
      setSuccess(`${ACTION_COPY[pending.kind].title} succeeded for ${pending.user.email}.`);
      setPending(null);
      await load();
      setTimeout(() => setSuccess(null), 4000);
    } catch (err) {
      setError((err as Error).message.replace(/^\d+\s*/, "") || "Action failed");
      setPending(null);
    } finally {
      setActing(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <span className="eyebrow">Workspace oversight</span>
        <h1>Admin<span className="heading-period">.</span></h1>
        <p>User management and workspace stats.</p>
      </div>

      {error && <div className="auth-error">{error}</div>}
      {success && <div className="auth-success">{success}</div>}

      <div className="admin-stats">
        <div className="admin-stat-tile glass-card">
          <Users size={18} />
          <div>
            <div className="admin-stat-value">{stats?.total_users ?? "—"}</div>
            <div className="admin-stat-label">Total users</div>
          </div>
        </div>
        <div className="admin-stat-tile glass-card">
          <Images size={18} />
          <div>
            <div className="admin-stat-value">{stats?.total_media ?? "—"}</div>
            <div className="admin-stat-label">Total media</div>
          </div>
        </div>
        <div className="admin-stat-tile glass-card">
          <ShieldCheck size={18} />
          <div>
            <div className="admin-stat-value">{stats?.total_admins ?? "—"}</div>
            <div className="admin-stat-label">Admins</div>
          </div>
        </div>
      </div>

      <div className="glass-card admin-table-card">
        {!users ? (
          <TableSkeleton rows={5} cols={7} />
        ) : (
          <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Name</th>
                <th>Role</th>
                <th>Status</th>
                <th>Media</th>
                <th className="admin-col-created">Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.email}</td>
                  <td>{u.display_name}</td>
                  <td>
                    <span className={`badge badge-${u.role}`}>{u.role}</span>
                  </td>
                  <td>
                    <span className={`badge ${u.is_active ? "badge-active" : "badge-inactive"}`}>
                      {u.is_active ? "active" : "inactive"}
                    </span>
                  </td>
                  <td>{u.media_count}</td>
                  <td className="admin-col-created">{new Date(u.created_at).toLocaleDateString()}</td>
                  <td className="admin-row-actions">
                    {u.id !== me?.id && (
                      <>
                        {u.is_active ? (
                          <button
                            className="btn btn-sm"
                            onClick={() => setPending({ user: u, kind: "deactivate" })}
                          >
                            Deactivate
                          </button>
                        ) : (
                          <button
                            className="btn btn-sm"
                            onClick={() => setPending({ user: u, kind: "reactivate" })}
                          >
                            Reactivate
                          </button>
                        )}
                        <label className="admin-role-select">
                          <UserCog size={14} />
                          <select
                            value={u.role}
                            onChange={(e) =>
                              setPending({ user: u, kind: "role", newRole: e.target.value as Role })
                            }
                          >
                            <option value="admin">admin</option>
                            <option value="editor">editor</option>
                            <option value="viewer">viewer</option>
                          </select>
                        </label>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {pending && (
        <div className="admin-modal-overlay" onClick={() => !acting && setPending(null)}>
          <div className="admin-modal glass-card" onClick={(e) => e.stopPropagation()}>
            <h3>{ACTION_COPY[pending.kind].title}</h3>
            <p>{ACTION_COPY[pending.kind].body(pending.user, pending.newRole)}</p>
            <div className="admin-modal-actions">
              <button className="btn" onClick={() => setPending(null)} disabled={acting}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={confirmAction} disabled={acting}>
                {acting ? "Working…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
