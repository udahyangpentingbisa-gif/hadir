"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

type Theme = "light" | "dark";
const THEME_STORAGE_KEY = "hadir-theme";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    const initialTheme = savedTheme === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = initialTheme;
    setTheme(initialTheme);
  }, []);

  function toggleTheme() {
    const nextTheme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    setTheme(nextTheme);
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={theme === "dark" ? "Aktifkan mode terang" : "Aktifkan mode gelap"}
      aria-pressed={theme === "dark"}
      title={theme === "dark" ? "Mode terang" : "Mode gelap"}
      className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[#e1e8e2] bg-white text-[#45544c] transition hover:bg-[#f2f6f2] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#15734c]"
    >
      {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
