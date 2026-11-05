import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { SearchIcon, Video, ImageIcon } from "lucide-react";
import { api, type SearchResult } from "../lib/api";
import "./Search.css";

export function SearchPage() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const navigate = useNavigate();

  const runSearch = async (query: string) => {
    if (!query.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    setSearched(true);
    try {
      const data = await api.search(query);
      setResults(data);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Search</h1>
        <p>Full-text search across filenames, auto-generated tags, and video transcripts.</p>
      </div>

      <form
        className="search-bar"
        onSubmit={(e) => {
          e.preventDefault();
          runSearch(q);
        }}
      >
        <input
          type="text"
          placeholder="Search for a word, tag, or something said in a video…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />
        <button className="btn btn-primary" type="submit">
          <SearchIcon size={16} /> Search
        </button>
      </form>

      {loading ? (
        <div className="empty-state">Searching…</div>
      ) : searched && results.length === 0 ? (
        <div className="empty-state">No matches for “{q}”.</div>
      ) : (
        results.map((r, i) => (
          <div
            key={`${r.media_id}-${i}`}
            className="search-result"
            onClick={() => navigate(`/media/${r.media_id}`)}
          >
            {r.thumb_url ? (
              <img className="search-result-thumb" src={r.thumb_url} alt="" />
            ) : (
              <div className="search-result-thumb" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                {r.media_type === "video" ? <Video size={20} /> : <ImageIcon size={20} />}
              </div>
            )}
            <div className="search-result-main">
              <div className="search-result-title">
                {r.filename}
                <span className="tag-chip">{r.source}</span>
                {r.segment_start !== null && <span className="tag-chip">@ {r.segment_start.toFixed(1)}s</span>}
              </div>
              <div className="search-result-snippet" dangerouslySetInnerHTML={{ __html: r.snippet }} />
            </div>
          </div>
        ))
      )}
    </div>
  );
}
