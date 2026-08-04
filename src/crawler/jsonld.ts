/**
 * JSON-LD date extraction. Pages embed schema.org structured data in
 * <script type="application/ld+json"> blocks (often Article/BlogPosting/WebPage).
 * We pull `datePublished` and `dateModified`, walking nested objects, arrays, and
 * the `@graph` envelope, returning the first valid date found for each.
 */
export interface JsonLdDates {
  datePublished: Date | null;
  dateModified: Date | null;
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Recursively search a parsed JSON-LD value for the first published/modified date. */
function walk(node: unknown, found: JsonLdDates, depth = 0): void {
  if (depth > 8 || node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) walk(item, found, depth + 1);
    return;
  }
  const obj = node as Record<string, unknown>;
  if (!found.datePublished) {
    const d = parseDate(obj.datePublished ?? obj.dateCreated ?? obj.uploadDate);
    if (d) found.datePublished = d;
  }
  if (!found.dateModified) {
    const d = parseDate(obj.dateModified);
    if (d) found.dateModified = d;
  }
  // Recurse into nested objects (@graph, mainEntity, etc.).
  for (const key of Object.keys(obj)) {
    if (found.datePublished && found.dateModified) return;
    walk(obj[key], found, depth + 1);
  }
}

/** Extract dates from a set of raw JSON-LD script contents. */
export function extractJsonLdDates(scripts: string[]): JsonLdDates {
  const found: JsonLdDates = { datePublished: null, dateModified: null };
  for (const raw of scripts) {
    if (found.datePublished && found.dateModified) break;
    try {
      walk(JSON.parse(raw), found);
    } catch {
      // Malformed JSON-LD block — skip it.
    }
  }
  return found;
}
