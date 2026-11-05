import { useEffect, useState } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import { api, type SettingsInfo } from "../lib/api";
import { ThemeToggle } from "../components/ThemeToggle";

export function SettingsPage() {
  const [settings, setSettings] = useState<SettingsInfo | null>(null);
  const [reindexing, setReindexing] = useState(false);
  const [reindexMsg, setReindexMsg] = useState<string | null>(null);

  useEffect(() => {
    api.settings().then(setSettings);
  }, []);

  const runReindex = async () => {
    setReindexing(true);
    setReindexMsg(null);
    try {
      const res = await api.reindex();
      setReindexMsg(`Re-indexed ${res.reindexed} item(s) for search.`);
    } catch (err) {
      setReindexMsg(`Re-index failed: ${(err as Error).message}`);
    } finally {
      setReindexing(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Settings</h1>
        <p>Theme, LLM provider status, and index maintenance.</p>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "1fr", maxWidth: 560, gap: 20 }}>
        <div className="glass-card" style={{ padding: 20 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 14, color: "var(--text-muted)", textTransform: "uppercase" }}>
            Appearance
          </h3>
          <div style={{ maxWidth: 220 }}>
            <ThemeToggle />
          </div>
        </div>

        <div className="glass-card" style={{ padding: 20 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 14, color: "var(--text-muted)", textTransform: "uppercase" }}>
            <Sparkles size={14} style={{ verticalAlign: -2, marginRight: 4 }} />
            Ask AI provider
          </h3>
          {settings ? (
            <div style={{ fontSize: 14, lineHeight: 1.8 }}>
              <div>
                Provider: <strong>{settings.llm_provider}</strong>{" "}
                {settings.llm_provider === "mock" && <span className="tag-chip">offline / template mode</span>}
              </div>
              {settings.llm_provider === "anthropic" && (
                <div>
                  API key configured:{" "}
                  <strong style={{ color: settings.anthropic_key_configured ? "var(--success)" : "var(--danger)" }}>
                    {settings.anthropic_key_configured ? "yes" : "no"}
                  </strong>
                </div>
              )}
              <div>
                Whisper ASR model: <strong>{settings.whisper_model}</strong>
              </div>
              <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 10 }}>
                Switch providers by setting <code>LLM_PROVIDER=anthropic</code> and{" "}
                <code>ANTHROPIC_API_KEY=...</code> in <code>backend/.env</code>, then restart the backend. See
                the README for details.
              </p>
            </div>
          ) : (
            "Loading…"
          )}
        </div>

        <div className="glass-card" style={{ padding: 20 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 14, color: "var(--text-muted)", textTransform: "uppercase" }}>
            Search index
          </h3>
          <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 0 }}>
            Rebuilds the full-text search index from current filenames, tags, and transcripts. Useful after
            bulk changes or if search results look stale.
          </p>
          <button className="btn btn-primary" onClick={runReindex} disabled={reindexing}>
            <RefreshCw size={16} className={reindexing ? "spin" : ""} />
            {reindexing ? "Re-indexing…" : "Re-index now"}
          </button>
          {reindexMsg && <div style={{ marginTop: 10, fontSize: 13, color: "var(--text-muted)" }}>{reindexMsg}</div>}
        </div>
      </div>
    </div>
  );
}
