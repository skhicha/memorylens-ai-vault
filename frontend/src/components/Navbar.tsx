import { NavLink } from "react-router-dom";
import {
  Upload,
  LayoutGrid,
  Clock,
  Map as MapIcon,
  Search,
  Sparkles,
  BarChart3,
  Settings as SettingsIcon,
  Camera,
} from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import "./Navbar.css";

const LINKS = [
  { to: "/upload", label: "Upload", icon: Upload },
  { to: "/library", label: "Library", icon: LayoutGrid },
  { to: "/timeline", label: "Timeline", icon: Clock },
  { to: "/map", label: "Map", icon: MapIcon },
  { to: "/search", label: "Search", icon: Search },
  { to: "/ask", label: "Ask AI", icon: Sparkles },
  { to: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

export function Navbar() {
  return (
    <nav className="navbar glass-card">
      <div className="navbar-brand">
        <div className="navbar-logo">
          <Camera size={20} />
        </div>
        <div>
          <div className="navbar-title">MemoryLens AI</div>
          <div className="navbar-subtitle">Personal media vault</div>
        </div>
      </div>

      <div className="navbar-links">
        {LINKS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `navbar-link${isActive ? " active" : ""}`}
          >
            <Icon size={18} />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>

      <div className="navbar-footer">
        <ThemeToggle />
      </div>
    </nav>
  );
}
