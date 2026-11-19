import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "../lib/leafletIcons";
import { api, withAuth, type MediaItem } from "../lib/api";

export function MapViewPage() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    api.listMedia().then((data) => setItems(data.filter((m) => m.gps_lat != null && m.gps_lon != null)));
  }, []);

  const center: [number, number] = items.length
    ? [items[0].gps_lat as number, items[0].gps_lon as number]
    : [20, 0];

  // Multiple items taken at (or near) the exact same spot would otherwise
  // render as perfectly overlapping Leaflet markers -- only the topmost one
  // visible or clickable, making every item but one invisible on the map
  // even though each has its own real marker underneath. Group items by
  // rounded coordinates and fan out same-spot duplicates in a small circle
  // (a few metres' radius) so every item gets its own visible, clickable pin.
  const groups = new Map<string, MediaItem[]>();
  for (const item of items) {
    const key = `${(item.gps_lat as number).toFixed(5)},${(item.gps_lon as number).toFixed(5)}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(item);
  }
  const positions = new Map<string, [number, number]>();
  for (const group of groups.values()) {
    if (group.length === 1) {
      positions.set(group[0].id, [group[0].gps_lat as number, group[0].gps_lon as number]);
      continue;
    }
    const FAN_RADIUS_DEG = 0.00008; // roughly 8-9 metres
    group.forEach((item, i) => {
      const angle = (2 * Math.PI * i) / group.length;
      positions.set(item.id, [
        (item.gps_lat as number) + FAN_RADIUS_DEG * Math.sin(angle),
        (item.gps_lon as number) + FAN_RADIUS_DEG * Math.cos(angle),
      ]);
    });
  }

  return (
    <div>
      <div className="page-header">
        <span className="eyebrow">Where it happened</span>
        <h1>Map<span className="heading-period">.</span></h1>
        <p>Photos and videos with GPS data in their EXIF metadata, plotted by location.</p>
      </div>

      {items.length === 0 ? (
        <div className="empty-state glass-card">
          No geotagged media yet. Photos with GPS EXIF data (most phone cameras include it) will show up here.
        </div>
      ) : (
        <div className="glass-card" style={{ height: "70vh", overflow: "hidden" }}>
          <MapContainer center={center} zoom={items.length === 1 ? 12 : 3} style={{ height: "100%", width: "100%" }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
            {items.map((item) => (
              <Marker key={item.id} position={positions.get(item.id)!}>
                <Popup>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {item.thumb_url && <img src={withAuth(item.thumb_url)} alt={item.filename} style={{ width: 160, borderRadius: 6 }} />}
                    <strong>{item.filename}</strong>
                    <button className="btn" onClick={() => navigate(`/media/${item.id}`)}>
                      Open
                    </button>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      )}
    </div>
  );
}
