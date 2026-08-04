import { XMLParser } from "fast-xml-parser";
import { normalizeUrl } from "./url";
import type { TextFetcher } from "./fetcher";

/**
 * Fetch and parse XML sitemaps, recursively following <sitemapindex> entries.
 * Returns the de-duplicated set of normalised page URLs (<urlset><url><loc>).
 * Bounded by maxSitemaps to avoid runaway recursion on misconfigured sites.
 */
const parser = new XMLParser({ ignoreAttributes: true, isArray: () => false });

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

/** Strip an XML namespace prefix from a tag name: "image:loc" → "loc", "urlset" → "urlset". */
function localName(key: string): string {
  const i = key.indexOf(":");
  return i === -1 ? key : key.slice(i + 1);
}

/** Find a child node by local (namespace-stripped) name, ignoring PIs like ?xml. */
function findByLocalName(root: Record<string, any>, name: string): any {
  for (const key of Object.keys(root)) {
    if (key.startsWith("?")) continue; // processing instruction (?xml, ?xml-stylesheet)
    if (localName(key).toLowerCase() === name) return root[key];
  }
  return undefined;
}

export type SitemapDoc =
  | { kind: "index"; sitemaps: string[] }
  | { kind: "urlset"; urls: { loc: string; lastmod: Date | null }[] }
  | null;

/**
 * Pure parser for a single sitemap document. Handles both a <sitemapindex> (pointing
 * to child sitemaps) and a <urlset> (page URLs + <lastmod>), tolerating XML stylesheet
 * processing instructions, trailing comments, single-vs-multiple entries, and
 * namespace-prefixed roots (e.g. <sm:urlset>). Returns null if it's neither.
 */
export function parseSitemapDoc(xml: string): SitemapDoc {
  let doc: unknown;
  try {
    doc = parser.parse(xml);
  } catch {
    return null;
  }
  if (!doc || typeof doc !== "object") return null;
  const root = doc as Record<string, any>;

  const index = findByLocalName(root, "sitemapindex");
  if (index) {
    const sitemaps: string[] = [];
    for (const entry of asArray(index.sitemap)) {
      const loc = entry?.loc;
      if (typeof loc === "string" && loc.trim()) sitemaps.push(loc.trim());
    }
    return { kind: "index", sitemaps };
  }

  const urlset = findByLocalName(root, "urlset");
  if (urlset) {
    const urls: { loc: string; lastmod: Date | null }[] = [];
    for (const entry of asArray(urlset.url)) {
      const loc = entry?.loc;
      if (typeof loc !== "string" || !loc.trim()) continue;
      urls.push({ loc: loc.trim(), lastmod: parseDate(entry?.lastmod) });
    }
    return { kind: "urlset", urls };
  }

  return null;
}

/** Parse a sitemap <lastmod> value (W3C datetime / date) into a Date, or null. */
export function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export interface SitemapEntry {
  /** <lastmod> as a Date, or null if absent/unparseable. */
  lastmod: Date | null;
}

/**
 * Crawl all sitemaps and return a map of normalised page URL → entry (with the
 * declared <lastmod>). Recursively follows <sitemapindex> entries. A URL present in
 * multiple sitemaps keeps the most recent lastmod seen.
 */
export async function collectSitemapUrls(
  sitemapUrls: string[],
  fetchText: TextFetcher,
  maxSitemaps = 50,
): Promise<Map<string, SitemapEntry>> {
  const out = new Map<string, SitemapEntry>();
  const visited = new Set<string>();
  const queue = [...sitemapUrls];

  while (queue.length > 0 && visited.size < maxSitemaps) {
    const sm = queue.shift()!;
    if (visited.has(sm)) continue;
    visited.add(sm);

    const xml = await fetchText(sm);
    if (!xml) continue;
    const doc = parseSitemapDoc(xml);
    if (!doc) continue;

    // Sitemap index → enqueue child sitemaps (which may themselves be indexes).
    if (doc.kind === "index") {
      for (const child of doc.sitemaps) queue.push(child);
      continue;
    }

    // URL set → collect page locations + lastmod.
    for (const { loc, lastmod } of doc.urls) {
      const n = normalizeUrl(loc);
      if (!n) continue;
      const prev = out.get(n);
      // Keep the newest lastmod if the URL appears in more than one sitemap.
      if (!prev || (lastmod && (!prev.lastmod || lastmod > prev.lastmod))) {
        out.set(n, { lastmod });
      }
    }
  }

  return out;
}

/** Default sitemap locations to probe when none are declared in robots.txt. */
export function defaultSitemapUrls(origin: string): string[] {
  return [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`];
}
