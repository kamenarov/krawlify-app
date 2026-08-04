/**
 * Theme handling shared by the no-flash boot script (injected in the root layout) and
 * the <ThemeToggle /> component, so both agree on the storage key and the resolution
 * rule: an explicit user choice wins, otherwise follow the OS via prefers-color-scheme.
 */

export type Theme = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "krawlify-theme";

/** Resolve "system" against the OS preference. */
export function resolveTheme(theme: Theme): "light" | "dark" {
  if (theme !== "system") return theme;
  return typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/** Read the stored preference (absent → "system"). */
export function readTheme(): Theme {
  if (typeof window === "undefined") return "system";
  const v = window.localStorage.getItem(THEME_STORAGE_KEY);
  return v === "light" || v === "dark" ? v : "system";
}

/** Apply a preference: toggles `.dark` on <html> and keeps color-scheme in sync. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  const effective = resolveTheme(theme);
  root.classList.toggle("dark", effective === "dark");
  root.style.colorScheme = effective;
}

/**
 * Runs before first paint (inline, blocking) so the correct theme is on <html> when the
 * page renders — otherwise dark-mode users get a white flash. Kept tiny and dependency
 * free; mirrors applyTheme() above.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var k=${JSON.stringify(
  THEME_STORAGE_KEY,
)};var s=localStorage.getItem(k);var d=s==="dark"||(s!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.classList.toggle("dark",d);r.style.colorScheme=d?"dark":"light";}catch(e){}})();`;
