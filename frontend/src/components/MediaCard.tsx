import { useNavigate } from "react-router-dom";
import { Video, ImageIcon, Users } from "lucide-react";
import type { MediaItem } from "../lib/api";
import { withAuth } from "../lib/api";
import "./MediaCard.css";

function formatDate(iso: string): string {
  const d = new Date(iso.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function MediaCard({ media }: { media: MediaItem }) {
  const navigate = useNavigate();
  return (
    <div className="media-card" onClick={() => navigate(`/media/${media.id}`)}>
      {media.thumb_url ? (
        <img className="media-card-thumb" src={withAuth(media.thumb_url)} alt={media.filename} loading="lazy" />
      ) : (
        <div className="media-card-thumb-placeholder">
          {media.media_type === "video" ? <Video size={28} /> : <ImageIcon size={28} />}
        </div>
      )}

      <div className="media-card-badge">
        {media.media_type === "video" ? <Video size={12} /> : <ImageIcon size={12} />}
        {media.media_type}
        {media.has_faces && (
          <>
            <Users size={12} style={{ marginLeft: 4 }} />
            {media.face_count}
          </>
        )}
      </div>

      {media.status !== "ready" && (
        <span className={`status-pill ${media.status} media-card-status`}>{media.status}</span>
      )}

      <div className="media-card-body">
        <div className="media-card-name" title={media.filename}>
          {media.filename}
        </div>
        <div className="media-card-meta">
          {formatDate(media.created_at)}
          {media.duration_s ? ` · ${media.duration_s.toFixed(1)}s` : ""}
        </div>
        {media.tags.length > 0 && (
          <div className="media-card-tags">
            {media.tags.slice(0, 3).map((t) => (
              <span key={t} className="tag-chip">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
