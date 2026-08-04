/**
 * Column definitions per tab. Single source of truth for both the export route
 * (CSV/XLSX headers + cell extraction) and the UI DataTable. `accessor` is the row
 * property; arrays are joined for display/export.
 */
export interface ColumnDef {
  key: string;
  header: string;
  width?: number; // px (UI) / chars (xlsx)
}

export const TAB_COLUMNS: Record<string, ColumnDef[]> = {
  internal: [
    { key: "url", header: "URL", width: 420 },
    { key: "statusCode", header: "Status", width: 80 },
    { key: "contentType", header: "Content Type", width: 160 },
    { key: "indexability", header: "Indexability", width: 130 },
    { key: "depth", header: "Depth", width: 70 },
    { key: "inlinkCount", header: "Inlinks", width: 80 },
    { key: "wordCount", header: "Words", width: 80 },
    { key: "responseTimeMs", header: "Resp (ms)", width: 90 },
  ],
  external: [
    { key: "url", header: "URL", width: 480 },
    { key: "statusCode", header: "Status", width: 80 },
    { key: "contentType", header: "Content Type", width: 180 },
  ],
  "response-codes": [
    { key: "url", header: "URL", width: 460 },
    { key: "statusCode", header: "Status", width: 80 },
    { key: "statusClass", header: "Class", width: 70 },
    { key: "contentType", header: "Content Type", width: 180 },
    { key: "indexability", header: "Indexability", width: 130 },
  ],
  titles: [
    { key: "url", header: "URL", width: 360 },
    { key: "title", header: "Title 1", width: 360 },
    { key: "titleLength", header: "Length", width: 80 },
    { key: "titlePixelWidth", header: "Pixels", width: 80 },
    { key: "titleIssues", header: "Issues", width: 180 },
  ],
  meta: [
    { key: "url", header: "URL", width: 360 },
    { key: "metaDescription", header: "Meta Description 1", width: 420 },
    { key: "metaDescLength", header: "Length", width: 80 },
    { key: "metaDescPixelWidth", header: "Pixels", width: 80 },
    { key: "metaIssues", header: "Issues", width: 160 },
  ],
  headings: [
    { key: "url", header: "URL", width: 300 },
    { key: "h1", header: "H1", width: 260 },
    { key: "h1Count", header: "H1#", width: 60 },
    { key: "h2", header: "H2", width: 240 },
    { key: "h2Count", header: "H2#", width: 60 },
    { key: "h3", header: "H3", width: 220 },
    { key: "h3Count", header: "H3#", width: 60 },
    { key: "h4", header: "H4", width: 180 },
    { key: "h5", header: "H5", width: 160 },
    { key: "h6", header: "H6", width: 160 },
    { key: "h1Issues", header: "Issues", width: 150 },
  ],
  directives: [
    { key: "url", header: "URL", width: 360 },
    { key: "indexability", header: "Indexability", width: 130 },
    { key: "metaRobots", header: "Meta Robots", width: 180 },
    { key: "canonicalUrl", header: "Canonical", width: 360 },
    { key: "canonicalMismatch", header: "Canonical Mismatch", width: 150 },
  ],
  images: [
    { key: "url", header: "Image URL", width: 460 },
    { key: "referrerUrl", header: "Found On", width: 360 },
    { key: "statusCode", header: "Status", width: 80 },
    { key: "altText", header: "Alt Text", width: 300 },
    { key: "altLength", header: "Alt Length", width: 90 },
    { key: "altIssues", header: "Issues", width: 160 },
  ],
  "broken-assets": [
    { key: "url", header: "Resource URL", width: 460 },
    { key: "type", header: "Type", width: 110 },
    { key: "statusCode", header: "Status", width: 80 },
    { key: "referrerUrl", header: "Found On", width: 380 },
  ],
  links: [
    { key: "sourceUrl", header: "Source URL", width: 340 },
    { key: "targetUrl", header: "Destination URL", width: 340 },
    { key: "anchorText", header: "Anchor", width: 200 },
    { key: "isInternal", header: "Internal", width: 80 },
    { key: "nofollow", header: "Nofollow", width: 90 },
    { key: "rel", header: "Rel", width: 120 },
    { key: "target", header: "Target", width: 100 },
    { key: "isBlank", header: "_blank", width: 80 },
  ],
  redirects: [
    { key: "sourceUrl", header: "Source URL", width: 380 },
    { key: "statusCode", header: "Status", width: 80 },
    { key: "targetUrl", header: "Target URL", width: 380 },
    { key: "chainPosition", header: "Hop", width: 70 },
    { key: "finalUrl", header: "Final URL", width: 380 },
    { key: "finalStatus", header: "Final Status", width: 100 },
  ],
  sitemaps: [
    { key: "url", header: "URL", width: 460 },
    { key: "statusCode", header: "Status", width: 80 },
    { key: "inlinkCount", header: "Inlinks", width: 80 },
    { key: "isOrphan", header: "Orphan", width: 90 },
    { key: "indexability", header: "Indexability", width: 130 },
  ],
  dates: [
    { key: "url", header: "URL", width: 420 },
    { key: "datePublished", header: "Published (JSON-LD)", width: 170 },
    { key: "dateModified", header: "Modified (JSON-LD)", width: 170 },
    { key: "sitemapLastmod", header: "Sitemap lastmod", width: 170 },
    { key: "statusCode", header: "Status", width: 80 },
  ],
};

// Columns rendered as dates (ISO strings from the API / Date objects in exports).
const DATE_KEYS = new Set(["datePublished", "dateModified", "sitemapLastmod"]);

/** Format a date value compactly as "YYYY-MM-DD HH:mm" (UTC), or "" if invalid. */
function formatDate(v: unknown): string {
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 16).replace("T", " ");
}

/** Render a cell value for CSV/XLSX/UI (dates formatted, arrays joined, bools/nulls normalised). */
export function cellValue(row: Record<string, unknown>, key: string): string | number {
  const v = row[key];
  if (v === null || v === undefined) return "";
  if (DATE_KEYS.has(key)) return formatDate(v);
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") return v;
  return String(v);
}
