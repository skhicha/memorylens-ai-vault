import { useCallback, useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import { api, type MediaItem } from "../lib/api";
import "./Upload.css";

interface UploadRow {
  key: string;
  file: File;
  progress: number;
  media?: MediaItem;
  error?: string;
}

const ACCEPTED_EXT = [".jpg", ".jpeg", ".png", ".webp", ".bmp", ".heic", ".mp4", ".mov", ".m4v", ".avi", ".mkv", ".webm"];

export function UploadPage() {
  const [rows, setRows] = useState<UploadRow[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pollTimers = useRef<Record<string, number>>({});

  const pollStatus = useCallback((key: string, mediaId: string) => {
    const tick = async () => {
      try {
        const media = await api.getMedia(mediaId);
        setRows((prev) => prev.map((r) => (r.key === key ? { ...r, media } : r)));
        if (media.status === "pending" || media.status === "processing") {
          pollTimers.current[key] = window.setTimeout(tick, 1500);
        }
      } catch {
        // media might not be queryable yet right after insert; retry briefly
        pollTimers.current[key] = window.setTimeout(tick, 2000);
      }
    };
    tick();
  }, []);

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      const list = Array.from(files).filter((f) => {
        const ext = "." + f.name.split(".").pop()?.toLowerCase();
        return ACCEPTED_EXT.includes(ext);
      });
      for (const file of list) {
        const key = `${file.name}-${file.size}-${Date.now()}-${Math.random()}`;
        setRows((prev) => [...prev, { key, file, progress: 0 }]);
        api
          .uploadMedia(file, (pct) => {
            setRows((prev) => prev.map((r) => (r.key === key ? { ...r, progress: pct } : r)));
          })
          .then((media) => {
            setRows((prev) => prev.map((r) => (r.key === key ? { ...r, media, progress: 100 } : r)));
            pollStatus(key, media.id);
          })
          .catch((err: Error) => {
            setRows((prev) => prev.map((r) => (r.key === key ? { ...r, error: err.message } : r)));
          });
      }
    },
    [pollStatus]
  );

  return (
    <div>
      <div className="page-header">
        <h1>Upload media</h1>
        <p>Drop in photos or videos. MemoryLens AI processes them in the background — faces, transcripts, EXIF/GPS, and tags.</p>
      </div>

      <div
        className={`dropzone glass-card${dragActive ? " active" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
      >
        <div className="dropzone-icon">
          <UploadCloud size={26} />
        </div>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Drag & drop files here, or click to browse</div>
        <div style={{ fontSize: 13 }}>JPG, PNG, WEBP, HEIC · MP4, MOV, MKV, WEBM</div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED_EXT.join(",")}
          style={{ display: "none" }}
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
      </div>

      {rows.length > 0 && (
        <div className="upload-list">
          {rows.map((row) => (
            <div key={row.key} className="upload-row">
              {row.media?.thumb_url ? (
                <img className="upload-row-thumb" src={row.media.thumb_url} alt="" />
              ) : (
                <div className="upload-row-thumb" />
              )}
              <div className="upload-row-info">
                <div className="upload-row-name">{row.file.name}</div>
                {row.error ? (
                  <div style={{ color: "var(--danger)", fontSize: 12.5 }}>{row.error}</div>
                ) : (
                  <>
                    <div className="upload-progress-track">
                      <div className="upload-progress-fill" style={{ width: `${row.progress}%` }} />
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                      {row.progress < 100
                        ? `Uploading… ${row.progress}%`
                        : row.media
                        ? `Status: ${row.media.status}`
                        : "Uploading…"}
                    </div>
                  </>
                )}
              </div>
              {row.media && <span className={`status-pill ${row.media.status}`}>{row.media.status}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
