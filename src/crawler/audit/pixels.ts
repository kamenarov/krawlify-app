/**
 * Approximate rendered pixel width of a string, mimicking how Screaming Frog
 * reports title/meta pixel widths (Arial ~16px for titles). This is an
 * approximation using a per-character width table — good enough to flag
 * over/under-length on a pixel basis without rendering.
 */

// Width in px at the reference font size for common character buckets.
const WIDTHS: Record<string, number> = {
  // narrow
  "iIl.,:;'|!ftj": 4,
  // medium-narrow
  "r()[]{}-\" ": 6,
  // default lowercase
  abcdefghknopqsuvxyz: 8,
  // wide lowercase / digits
  "mw0123456789": 10,
  // uppercase
  ABCDEFGHKNOPQRSUVXYZ: 11,
  // extra wide uppercase
  MW: 14,
};

const charWidth = (() => {
  const table = new Map<string, number>();
  for (const [chars, w] of Object.entries(WIDTHS)) {
    for (const c of chars) table.set(c, w);
  }
  return (ch: string) => table.get(ch) ?? 9; // fallback average
})();

export function pixelWidth(text: string): number {
  let total = 0;
  for (const ch of text) total += charWidth(ch);
  return total;
}
