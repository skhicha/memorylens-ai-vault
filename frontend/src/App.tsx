import { Navigate, Route, Routes } from "react-router-dom";
import { Navbar } from "./components/Navbar";
import { UploadPage } from "./pages/Upload";
import { LibraryPage } from "./pages/Library";
import { MediaDetailPage } from "./pages/MediaDetail";
import { TimelinePage } from "./pages/Timeline";
import { MapViewPage } from "./pages/MapView";
import { SearchPage } from "./pages/Search";
import { AskAIPage } from "./pages/AskAI";
import { DashboardPage } from "./pages/Dashboard";
import { SettingsPage } from "./pages/Settings";

export default function App() {
  return (
    <div className="app-shell">
      <Navbar />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Navigate to="/library" replace />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/media/:id" element={<MediaDetailPage />} />
          <Route path="/timeline" element={<TimelinePage />} />
          <Route path="/map" element={<MapViewPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/ask" element={<AskAIPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/library" replace />} />
        </Routes>
      </main>
    </div>
  );
}
