import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { getStoredTheme, setStoredTheme, type Theme } from "../lib/theme";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => getStoredTheme());

  useEffect(() => {
    setStoredTheme(theme);
  }, [theme]);

  return (
    <button
      className="btn"
      style={{ width: "100%", justifyContent: "center" }}
      onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
      aria-label="Toggle theme"
    >
      {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
      {theme === "dark" ? "Light mode" : "Dark mode"}
    </button>
  );
}
