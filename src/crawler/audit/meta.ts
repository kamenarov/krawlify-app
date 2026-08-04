import { pixelWidth } from "./pixels";
import { THRESHOLDS } from "./thresholds";

export interface MetaAudit {
  metaDescription: string | null;
  metaDescLength: number | null;
  metaDescPixelWidth: number | null;
  metaDescCount: number;
  issues: string[]; // "missing" | "over" | "under" | "multiple"
}

/** Per-page meta-description audit. Duplicate detection deferred to read time. */
export function auditMeta(descriptions: string[]): MetaAudit {
  const cleaned = descriptions.map((d) => d.trim()).filter((d) => d.length > 0);
  const issues: string[] = [];

  if (cleaned.length === 0) {
    return {
      metaDescription: null,
      metaDescLength: null,
      metaDescPixelWidth: null,
      metaDescCount: 0,
      issues: ["missing"],
    };
  }

  if (cleaned.length > 1) issues.push("multiple");

  const desc = cleaned[0];
  const len = desc.length;
  const px = pixelWidth(desc);

  if (len > THRESHOLDS.metaDesc.maxChars) issues.push("over");
  else if (len < THRESHOLDS.metaDesc.minChars) issues.push("under");

  return {
    metaDescription: desc,
    metaDescLength: len,
    metaDescPixelWidth: px,
    metaDescCount: cleaned.length,
    issues,
  };
}
