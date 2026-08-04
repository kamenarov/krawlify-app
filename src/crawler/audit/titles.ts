import { pixelWidth } from "./pixels";
import { THRESHOLDS } from "./thresholds";

export interface TitleAudit {
  title: string | null;
  titleLength: number | null;
  titlePixelWidth: number | null;
  titleCount: number;
  issues: string[]; // "missing" | "over" | "under" | "multiple" (duplicate added later)
}

/**
 * Per-page title audit. Duplicate detection is NOT done here — it requires the
 * full crawl set and is computed via grouped queries at read/finalize time.
 */
export function auditTitles(titles: string[]): TitleAudit {
  const cleaned = titles.map((t) => t.trim()).filter((t) => t.length > 0);
  const issues: string[] = [];

  if (cleaned.length === 0) {
    return { title: null, titleLength: null, titlePixelWidth: null, titleCount: 0, issues: ["missing"] };
  }

  if (cleaned.length > 1) issues.push("multiple");

  const title = cleaned[0];
  const len = title.length;
  const px = pixelWidth(title);

  if (len > THRESHOLDS.title.maxChars || px > THRESHOLDS.title.maxPixels) issues.push("over");
  else if (len < THRESHOLDS.title.minChars) issues.push("under");

  return { title, titleLength: len, titlePixelWidth: px, titleCount: cleaned.length, issues };
}
