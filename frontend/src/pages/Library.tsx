import { useEffect, useMemo, useState } from "react";
import { ImageOff } from "lucide-react";
import { api, type MediaItem, type MediaType } from "../lib/api";
import { MediaCard } from "../components/MediaCard";
import "./Library.css";

export function LibraryPage() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [mediaType, setMediaType] = useState<MediaType | "">("");
  const [tag, setTag] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.listMedia({
        media_type: mediaType || undefined,
        tag: tag || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      });
      setItems(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaType, tag, dateFrom, dateTo]);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    items.forEach((i) => i.tags.forEach((t) => s.add(t)));
    return Array.from(s).sort();
  }, [items]);

  return (
    <div>
      <div className="page-header">
        <h1>Library</h1>
        <p>Every photo and video in your vault, with filters for type, tag, and date.</p>
      </div>

      <div className="library-filters">
        <select value={mediaType} onChange={(e) => setMediaType(e.target.value as MediaType | "")}>
          <option value="">All types</option>
          <option value="photo">Photos</option>
          <option value="video">Videos</option>
        </select>
        <select value={tag} onChange={(e) => setTag(e.target.value)}>
          <option value="">All tags</option>
          {allTags.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
      </div>

      {loading ? (
        <div className="empty-state">Loading…</div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <ImageOff size={32} style={{ marginBottom: 10 }} />
          <div>No media matches these filters yet. Try uploading something first.</div>
        </div>
      ) : (
        <div className="grid grid-cards">
          {items.map((item) => (
            <MediaCard key={item.id} media={item} />
          ))}
        </div>
      )}
    </div>
  );
}
