import * as cheerio from "cheerio";
import { normalizeUrl, isInternalUrl } from "./url";
import { extractJsonLdDates } from "./jsonld";

export interface ExtractedLink {
  targetUrl: string; // normalised, absolute
  anchorText: string;
  nofollow: boolean;
  isInternal: boolean;
  rel: string | null; // raw rel attribute
  target: string | null; // raw target attribute, e.g. "_blank"
}

export interface ExtractedAsset {
  url: string; // normalised, absolute
  type: "img" | "script" | "stylesheet";
  alt?: string; // images only
}

export interface ParsedPage {
  titles: string[];
  metaDescriptions: string[];
  headings: Record<"h1" | "h2" | "h3" | "h4" | "h5" | "h6", string[]>;
  canonical: string | null;
  metaRobots: string | null;
  wordCount: number;
  links: ExtractedLink[];
  assets: ExtractedAsset[];
  /** True if a <meta name="robots" content="nofollow"> applies to the whole page. */
  pageNofollow: boolean;
  /** Publish/modified dates from JSON-LD structured data. */
  datePublished: Date | null;
  dateModified: Date | null;
}

/**
 * Parse an HTML document with Cheerio and extract everything the auditors and the
 * crawl frontier need. Resolves all URLs against `baseUrl` (respecting <base href>).
 */
export function parseHtml(html: string, pageUrl: string, rootHost: string): ParsedPage {
  const $ = cheerio.load(html);

  // Respect <base href> for relative URL resolution.
  const baseHref = $("base[href]").first().attr("href");
  const baseUrl = baseHref ? normalizeUrl(baseHref, pageUrl) ?? pageUrl : pageUrl;

  const titles = $("title")
    .map((_, el) => $(el).text())
    .get();

  const metaDescriptions = $('meta[name="description" i]')
    .map((_, el) => $(el).attr("content") ?? "")
    .get();

  const headings = { h1: [], h2: [], h3: [], h4: [], h5: [], h6: [] } as ParsedPage["headings"];
  for (const lvl of ["h1", "h2", "h3", "h4", "h5", "h6"] as const) {
    headings[lvl] = $(lvl)
      .map((_, el) => $(el).text())
      .get();
  }

  const canonical = $('link[rel="canonical" i]').first().attr("href") ?? null;
  const metaRobots = $('meta[name="robots" i]').first().attr("content") ?? null;
  const pageNofollow = !!metaRobots && /\bnofollow\b/i.test(metaRobots);

  // JSON-LD dates — read script contents before scripts are stripped below.
  const ldScripts = $('script[type="application/ld+json" i]')
    .map((_, el) => $(el).text())
    .get();
  const { datePublished, dateModified } = extractJsonLdDates(ldScripts);

  // Word count from visible body text (scripts/styles removed).
  $("script, style, noscript").remove();
  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  const wordCount = bodyText ? bodyText.split(" ").length : 0;

  // Links — re-query against a fresh load so removals above don't drop anchors.
  const $links = cheerio.load(html);
  const links: ExtractedLink[] = [];
  const seenLinks = new Set<string>();
  $links("a[href]").each((_, el) => {
    const href = $links(el).attr("href");
    if (!href) return;
    const abs = normalizeUrl(href, baseUrl);
    if (!abs) return;
    if (seenLinks.has(abs)) return;
    seenLinks.add(abs);
    const relRaw = $links(el).attr("rel") ?? null;
    const rel = (relRaw ?? "").toLowerCase();
    const target = $links(el).attr("target") ?? null;
    links.push({
      targetUrl: abs,
      anchorText: $links(el).text().trim().slice(0, 300),
      nofollow: pageNofollow || /\bnofollow\b/.test(rel),
      isInternal: isInternalUrl(abs, rootHost),
      rel: relRaw,
      target,
    });
  });

  // Assets: images, scripts, stylesheets.
  const assets: ExtractedAsset[] = [];
  const seenAssets = new Set<string>();
  const pushAsset = (rawUrl: string | undefined, type: ExtractedAsset["type"], alt?: string) => {
    if (!rawUrl) return;
    const abs = normalizeUrl(rawUrl, baseUrl);
    if (!abs) return;
    const key = `${type}:${abs}`;
    if (seenAssets.has(key)) return;
    seenAssets.add(key);
    assets.push({ url: abs, type, alt });
  };
  $links("img[src]").each((_, el) =>
    pushAsset($links(el).attr("src"), "img", $links(el).attr("alt") ?? ""),
  );
  $links("script[src]").each((_, el) => pushAsset($links(el).attr("src"), "script"));
  $links('link[rel="stylesheet" i][href]').each((_, el) =>
    pushAsset($links(el).attr("href"), "stylesheet"),
  );

  return {
    titles,
    metaDescriptions,
    headings,
    canonical,
    metaRobots,
    wordCount,
    links,
    assets,
    pageNofollow,
    datePublished,
    dateModified,
  };
}
