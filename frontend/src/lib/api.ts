// Thin typed fetch wrapper for the MemoryLens AI backend.
// Requests go through Vite's dev proxy (/api -> http://localhost:8000).

export type MediaType = "photo" | "video";
export type MediaStatus = "pending" | "processing" | "ready" | "failed";

export interface MediaItem {
  id: string;
  filename: string;
  media_type: MediaType;
  status: MediaStatus;
  width: number | null;
  height: number | null;
  duration_s: number | null;
  fps: number | null;
  camera_model: string | null;
  gps_lat: number | null;
  gps_lon: number | null;
  taken_at: string | null;
  created_at: string;
  has_faces: boolean;
  face_count: number;
  time_of_day: string | null;
  outdoor_guess: string | null;
  asr_status: string;
  error: string | null;
  tags: string[];
  thumb_url: string | null;
}

export interface FaceBox {
  frame_time: number;
  x: number;
  y: number;
  w: number;
  h: number;
  keyframe_url: string | null;
}

export interface TranscriptSegment {
  start_time: number;
  end_time: number;
  text: string;
}

export interface MediaDetail extends MediaItem {
  faces: FaceBox[];
  transcript: TranscriptSegment[];
}

export interface SearchResult {
  media_id: string;
  filename: string;
  media_type: MediaType;
  thumb_url: string | null;
  source: "filename" | "tag" | "transcript";
  segment_start: number | null;
  snippet: string;
}

export interface Citation {
  media_id: string;
  filename: string;
  media_type: MediaType;
  source: string;
  segment_start: number | null;
  snippet: string;
}

export interface AskResponse {
  answer: string;
  provider: string;
  citations: Citation[];
}

export interface DashboardSummary {
  total_media: number;
  total_photos: number;
  total_videos: number;
  total_faces: number;
  total_with_gps: number;
  uploads_by_day: { date: string; count: number }[];
  type_split: { media_type: string; count: number }[];
  tag_distribution: { tag: string; count: number }[];
  map_hotspots: { media_id: string; filename: string; lat: number; lon: number }[];
}

export interface SettingsInfo {
  llm_provider: string;
  anthropic_key_configured: boolean;
  whisper_model: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch {
      // ignore - no JSON body
    }
    throw new Error(`${res.status} ${detail}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  uploadMedia(file: File, onProgress?: (pct: number) => void): Promise<MediaItem> {
    return new Promise((resolve, reject) => {
      const form = new FormData();
      form.append("file", file);
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/media/upload");
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText));
        } else {
          reject(new Error(`Upload failed: ${xhr.status} ${xhr.responseText}`));
        }
      };
      xhr.onerror = () => reject(new Error("Upload failed: network error"));
      xhr.send(form);
    });
  },

  listMedia(params?: { media_type?: MediaType; tag?: string; date_from?: string; date_to?: string }) {
    const qs = new URLSearchParams();
    if (params?.media_type) qs.set("media_type", params.media_type);
    if (params?.tag) qs.set("tag", params.tag);
    if (params?.date_from) qs.set("date_from", params.date_from);
    if (params?.date_to) qs.set("date_to", params.date_to);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return request<MediaItem[]>(`/api/media${suffix}`);
  },

  getMedia(id: string) {
    return request<MediaDetail>(`/api/media/${id}`);
  },

  deleteMedia(id: string) {
    return request<{ ok: boolean }>(`/api/media/${id}`, { method: "DELETE" });
  },

  search(q: string) {
    return request<SearchResult[]>(`/api/search?q=${encodeURIComponent(q)}`);
  },

  ask(question: string) {
    return request<AskResponse>(`/api/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });
  },

  dashboardSummary() {
    return request<DashboardSummary>(`/api/dashboard/summary`);
  },

  settings() {
    return request<SettingsInfo>(`/api/dashboard/settings`);
  },

  reindex() {
    return request<{ reindexed: number }>(`/api/dashboard/reindex`, { method: "POST" });
  },

  mediaFileUrl(id: string) {
    return `/api/media/${id}/file`;
  },

  thumbnailUrl(id: string) {
    return `/api/media/${id}/thumbnail`;
  },
};
