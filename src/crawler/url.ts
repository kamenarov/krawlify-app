import { createHash } from "node:crypto";

/**
 * URL utilities: normalisation, hashing, internal/external classification.
 * Normalisation is intentionally conservative — it must not merge genuinely
 * distinct URLs (which would hide pages) but should collapse trivial variants
 * (fragment, default port, trailing index, query ordering).
 */

const DEFAULT_PORTS: Record<string, string> = { "http:": "80", "https:": "443" };

export function normalizeUrl(input: string, base?: string): string | null {
  let u: URL;
  try {
    u = base ? new URL(input, base) : new URL(input);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;

  // Drop fragment.
  u.hash = "";

  // Lowercase host; strip default port.
  u.hostname = u.hostname.toLowerCase();
  if (u.port && DEFAULT_PORTS[u.protocol] === u.port) u.port = "";

  // Sort query params for stable dedupe (preserve values + multiplicity).
  if (u.search) {
    const params = [...u.searchParams.entries()].sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    u.search = "";
    const sp = new URLSearchParams();
    for (const [k, v] of params) sp.append(k, v);
    const s = sp.toString();
    u.search = s ? `?${s}` : "";
  }

  // Collapse empty path to "/".
  if (u.pathname === "") u.pathname = "/";

  return u.toString();
}

export function urlHash(url: string): string {
  return createHash("sha1").update(url).digest("hex");
}

/** Hash arbitrary text (titles, meta, H1) for fast duplicate grouping. */
export function hashStr(text: string): string {
  return createHash("sha1").update(text).digest("hex");
}

/** Registrable-ish host comparison. Treats www. as same-site. */
export function sameHost(host: string, rootHost: string): boolean {
  const a = host.toLowerCase().replace(/^www\./, "");
  const b = rootHost.toLowerCase().replace(/^www\./, "");
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function isInternalUrl(url: string, rootHost: string): boolean {
  const h = hostOf(url);
  return h !== "" && sameHost(h, rootHost);
}
