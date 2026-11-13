import { useEffect, useMemo, useState } from "react";
import { ImageOff, CheckSquare, Trash2, X } from "lucide-react";
import { api, type MediaItem, type MediaType } from "../lib/api";
import { MediaCard } from "../components/MediaCard";
import { LibrarySkeletonGrid } from "../components/Skeleton";
import "./Library.css";

export function LibraryPage() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [mediaType, setMediaType] = useState<MediaType | "">("");
  const [tag, setTag] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

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

  const visibleItems = useMemo(
    () => (favoritesOnly ? items.filter((i) => i.is_favorite) : items),
    [items, favoritesOnly]
  );

  const toggleSelectMode = () => {
    setSelectMode((s) => !s);
    setSelected(new Set());
  };

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const deleteSelected = async () => {
    if (selected.size === 0) return;
    if (!window.confirm(`Delete ${selected.size} selected item(s)? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await Promise.all(Array.from(selected).map((id) => api.deleteMedia(id)));
      setSelected(new Set());
      setSelectMode(false);
      await load();
    } finally {
      setDeleting(false);
    }
  };

  const onFavoriteChange = (id: string, is_favorite: boolean) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, is_favorite } : i)));
  };

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
        <button
          type="button"
          className={`btn btn-sm${favoritesOnly ? " btn-primary" : ""}`}
          onClick={() => setFavoritesOnly((v) => !v)}
        >
          Favorites
        </button>
        <button type="button" className={`btn btn-sm${selectMode ? " btn-primary" : ""}`} onClick={toggleSelectMode}>
          <CheckSquare size={14} /> {selectMode ? "Cancel select" : "Select"}
        </button>
      </div>

      {selectMode && (
        <div className="library-select-toolbar glass-card">
          <span>{selected.size} selected</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-sm" onClick={() => setSelected(new Set())} disabled={selected.size === 0}>
              <X size={14} /> Clear
            </button>
            <button
              className="btn btn-sm btn-danger"
              onClick={deleteSelected}
              disabled={selected.size === 0 || deleting}
            >
              <Trash2 size={14} /> {deleting ? "Deleting…" : "Delete selected"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <LibrarySkeletonGrid />
      ) : visibleItems.length === 0 ? (
        <div className="empty-state">
          <ImageOff size={32} style={{ marginBottom: 10 }} />
          <div>No media matches these filters yet. Try uploading something first.</div>
        </div>
      ) : (
        <div className="grid grid-cards">
          {visibleItems.map((item) => (
            <MediaCard
              key={item.id}
              media={item}
              selectable={selectMode}
              selected={selected.has(item.id)}
              onToggleSelect={() => toggleSelected(item.id)}
              onFavoriteChange={(fav) => onFavoriteChange(item.id, fav)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
