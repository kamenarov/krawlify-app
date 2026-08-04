export type HeadingLevel = "h1" | "h2" | "h3" | "h4" | "h5" | "h6";

export type HeadingLevels = Record<HeadingLevel, string[]>;

export interface HeadingAudit {
  levels: HeadingLevels;
  counts: Record<HeadingLevel, number>;
  issues: string[]; // "h1Missing" | "h1Multiple" (h1Duplicate added at read time)
}

const LEVELS: HeadingLevel[] = ["h1", "h2", "h3", "h4", "h5", "h6"];

/**
 * Per-page heading audit across all six levels (H1–H6). Trims/filters empties and
 * counts each level. H1-specific issues (missing, multiple) are flagged here;
 * duplicate-H1-across-pages is computed at read time via grouped queries.
 */
export function auditHeadings(raw: HeadingLevels): HeadingAudit {
  const levels = {} as HeadingLevels;
  const counts = {} as Record<HeadingLevel, number>;
  for (const lvl of LEVELS) {
    const cleaned = (raw[lvl] ?? []).map((h) => h.trim()).filter(Boolean);
    levels[lvl] = cleaned;
    counts[lvl] = cleaned.length;
  }

  const issues: string[] = [];
  if (counts.h1 === 0) issues.push("h1Missing");
  else if (counts.h1 > 1) issues.push("h1Multiple");

  return { levels, counts, issues };
}
