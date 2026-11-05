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

  return (
    <div>
      <div className="page-header">
        <h1>Map</h1>
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
              <Marker key={item.id} position={[item.gps_lat as number, item.gps_lon as number]}>
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
