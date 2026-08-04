"use client";

import { useEffect, useState } from "react";
import { applyTheme, readTheme, THEME_STORAGE_KEY, type Theme } from "@/lib/theme";

const OPTIONS: { value: Theme; label: string; icon: React.ReactNode }[] = [
  {
    value: "light",
    label: "Light",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    ),
  },
  {
    value: "system",
    label: "System",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
        <rect x="2" y="4" width="20" height="13" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </svg>
    ),
  },
  {
    value: "dark",
    label: "Dark",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
    ),
  },
];

/**
 * Light / System / Dark switcher. "System" (the default for a user who has never chosen)
 * follows prefers-color-scheme and keeps following it if the OS flips while the page is
 * open. An explicit choice is stored in localStorage and re-applied before first paint by
 * the boot script in the root layout.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("system");
  const [mounted, setMounted] = useState(false);

  // Read the stored preference after hydration (server render can't know it).
  useEffect(() => {
    setTheme(readTheme());
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (theme === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, theme);
    applyTheme(theme);
  }, [theme, mounted]);

  // Track OS changes while in "system" mode.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (readTheme() === "system") applyTheme("system");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className={`inline-flex shrink-0 items-center gap-0.5 rounded-md border bg-gray-50 p-0.5 ${className}`}
    >
      {OPTIONS.map((o) => {
        const active = mounted && theme === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={`${o.label} theme`}
            onClick={() => setTheme(o.value)}
            className={`rounded p-1.5 transition-colors ${
              active
                ? "bg-white text-blue-600 shadow-sm dark:bg-[#272438]"
                : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            }`}
          >
            {o.icon}
            <span className="sr-only">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
