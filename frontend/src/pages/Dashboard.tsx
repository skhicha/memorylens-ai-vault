import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, type DashboardSummary } from "../lib/api";
import "./Dashboard.css";

const COLORS = ["#7c6cff", "#4fd1c5", "#f0b429", "#ff6b6b", "#3ddc97", "#5a4ae0"];

export function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);

  useEffect(() => {
    api.dashboardSummary().then(setSummary);
  }, []);

  if (!summary) return <div className="empty-state">Loading…</div>;

  return (
    <div>
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>An overview of what's in your vault.</p>
      </div>

      <div className="stat-grid">
        <div className="glass-card stat-card">
          <div className="stat-value">{summary.total_media}</div>
          <div className="stat-label">Total media</div>
        </div>
        <div className="glass-card stat-card">
          <div className="stat-value">{summary.total_photos}</div>
          <div className="stat-label">Photos</div>
        </div>
        <div className="glass-card stat-card">
          <div className="stat-value">{summary.total_videos}</div>
          <div className="stat-label">Videos</div>
        </div>
        <div className="glass-card stat-card">
          <div className="stat-value">{summary.total_faces}</div>
          <div className="stat-label">Faces detected</div>
        </div>
        <div className="glass-card stat-card">
          <div className="stat-value">{summary.total_with_gps}</div>
          <div className="stat-label">Geotagged items</div>
        </div>
      </div>

      <div className="chart-grid">
        <div className="glass-card chart-card">
          <h3>Uploads over time</h3>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={summary.uploads_by_day}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" />
              <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={11} />
              <YAxis allowDecimals={false} stroke="var(--text-muted)" fontSize={11} />
              <Tooltip />
              <Line type="monotone" dataKey="count" stroke="#7c6cff" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-card chart-card">
          <h3>Photo vs video split</h3>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={summary.type_split}
                dataKey="count"
                nameKey="media_type"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={3}
              >
                {summary.type_split.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-card chart-card">
          <h3>Tag distribution</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={summary.tag_distribution} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" />
              <XAxis type="number" allowDecimals={false} stroke="var(--text-muted)" fontSize={11} />
              <YAxis type="category" dataKey="tag" width={110} stroke="var(--text-muted)" fontSize={11} />
              <Tooltip />
              <Bar dataKey="count" fill="#4fd1c5" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-card chart-card">
          <h3>Map hotspot summary</h3>
          {summary.map_hotspots.length === 0 ? (
            <div className="empty-state" style={{ padding: "30px 0" }}>
              No geotagged media yet.
            </div>
          ) : (
            <div style={{ maxHeight: 240, overflowY: "auto" }}>
              {summary.map_hotspots.map((h) => (
                <div
                  key={h.media_id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "8px 4px",
                    borderBottom: "1px solid var(--surface-border)",
                    fontSize: 13,
                  }}
                >
                  <span>{h.filename}</span>
                  <span style={{ color: "var(--text-muted)" }}>
                    {h.lat.toFixed(3)}, {h.lon.toFixed(3)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
