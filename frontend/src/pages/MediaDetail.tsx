import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Trash2, MapPin, Camera, Clock3 } from "lucide-react";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "../lib/leafletIcons";
import { api, withAuth, type MediaDetail as MediaDetailType } from "../lib/api";
import { FaceBoxOverlay } from "../components/FaceBoxOverlay";
import { useAuth } from "../lib/AuthContext";
import "./MediaDetail.css";

export function MediaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canEdit = user?.role !== "viewer";
  const [media, setMedia] = useState<MediaDetailType | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!id) return;
    api.getMedia(id).then(setMedia);
  }, [id]);

  if (!media) return <div className="empty-state">Loading…</div>;

  const seekTo = (t: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = t;
      videoRef.current.play().catch(() => {});
    }
  };

  const photoFaces = media.media_type === "photo" ? media.faces : [];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button className="btn" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} /> Back
        </button>
        <h1 style={{ fontSize: 20, margin: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
          {media.filename}
        </h1>
        <span className={`status-pill ${media.status}`}>{media.status}</span>
        <button
          className="btn"
          disabled={!canEdit}
          title={canEdit ? "Delete" : "Viewers can't delete media"}
          onClick={async () => {
            if (!canEdit) return;
            if (confirm(`Delete ${media.filename}? This cannot be undone.`)) {
              await api.deleteMedia(media.id);
              navigate("/library");
            }
          }}
        >
          <Trash2 size={16} />
        </button>
      </div>

      <div className="detail-layout">
        <div>
          <div className="detail-media-wrap glass-card">
            {media.media_type === "photo" ? (
              <>
                <img
                  src={api.mediaFileUrl(media.id)}
                  alt={media.filename}
                  onLoad={(e) => {
                    const img = e.currentTarget;
                    setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
                  }}
                />
                {naturalSize && (
                  <FaceBoxOverlay faces={photoFaces} naturalWidth={naturalSize.w} naturalHeight={naturalSize.h} />
                )}
              </>
            ) : (
              <video ref={videoRef} src={api.mediaFileUrl(media.id)} controls />
            )}
          </div>

          {media.media_type === "video" && media.faces.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <h3 style={{ fontSize: 13, textTransform: "uppercase", color: "var(--text-muted)" }}>
                Keyframes with faces
              </h3>
              <div className="keyframe-strip">
                {Array.from(new Map(media.faces.map((f) => [f.keyframe_url, f])).values()).map((f) =>
                  f.keyframe_url ? (
                    <div key={f.keyframe_url} className="keyframe-thumb" onClick={() => seekTo(f.frame_time)}>
                      <img src={withAuth(f.keyframe_url!)} alt={`t=${f.frame_time}s`} />
                      <div className="kf-time">{f.frame_time.toFixed(1)}s</div>
                    </div>
                  ) : null
                )}
              </div>
            </div>
          )}
        </div>

        <div className="detail-panel glass-card">
          <div className="detail-panel-section">
            <h3>Tags</h3>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {media.tags.length ? (
                media.tags.map((t) => (
                  <span key={t} className="tag-chip">
                    {t}
                  </span>
                ))
              ) : (
                <span style={{ color: "var(--text-muted)", fontSize: 13 }}>No tags yet</span>
              )}
            </div>
          </div>

          <div className="detail-panel-section">
            <h3>
              <Camera size={13} style={{ verticalAlign: -2, marginRight: 4 }} />
              Metadata
            </h3>
            <dl className="exif-grid">
              {media.width && media.height && (
                <>
                  <dt>Dimensions</dt>
                  <dd>
                    {media.width} × {media.height}
                  </dd>
                </>
              )}
              {media.duration_s != null && (
                <>
                  <dt>Duration</dt>
                  <dd>{media.duration_s.toFixed(1)}s</dd>
                </>
              )}
              {media.fps != null && (
                <>
                  <dt>FPS</dt>
                  <dd>{media.fps.toFixed(1)}</dd>
                </>
              )}
              {media.camera_model && (
                <>
                  <dt>Camera</dt>
                  <dd>{media.camera_model}</dd>
                </>
              )}
              {media.taken_at && (
                <>
                  <dt>Taken</dt>
                  <dd>{media.taken_at}</dd>
                </>
              )}
              <dt>Uploaded</dt>
              <dd>{media.created_at}</dd>
              <dt>Faces detected</dt>
              <dd>{media.face_count}</dd>
              {media.media_type === "video" && (
                <>
                  <dt>Transcription</dt>
                  <dd>{media.asr_status}</dd>
                </>
              )}
              {media.error && (
                <>
                  <dt>Error</dt>
                  <dd style={{ color: "var(--danger)" }}>{media.error}</dd>
                </>
              )}
            </dl>
          </div>

          {media.transcript.length > 0 && (
            <div className="detail-panel-section">
              <h3>
                <Clock3 size={13} style={{ verticalAlign: -2, marginRight: 4 }} />
                Transcript
              </h3>
              <div className="transcript-list">
                {media.transcript.map((seg, i) => (
                  <div key={i} className="transcript-row" onClick={() => seekTo(seg.start_time)}>
                    <span className="transcript-time">{seg.start_time.toFixed(1)}s</span>
                    <span>{seg.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {media.gps_lat != null && media.gps_lon != null && (
            <div className="detail-panel-section">
              <h3>
                <MapPin size={13} style={{ verticalAlign: -2, marginRight: 4 }} />
                Location
              </h3>
              <div className="detail-map">
                <MapContainer center={[media.gps_lat, media.gps_lon]} zoom={13} style={{ height: "100%", width: "100%" }}>
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
                  <Marker position={[media.gps_lat, media.gps_lon]}>
                    <Popup>{media.filename}</Popup>
                  </Marker>
                </MapContainer>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
