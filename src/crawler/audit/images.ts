import { THRESHOLDS } from "./thresholds";

export interface ImageAudit {
  altText: string | null;
  altLength: number | null;
  issues: string[]; // "altMissing" | "altOver" (broken added after fetching)
}

/** Per-image alt-text audit (missing, over 100 chars). */
export function auditImageAlt(alt: string | null | undefined): ImageAudit {
  const trimmed = alt?.trim() ?? "";
  const issues: string[] = [];

  if (trimmed.length === 0) {
    issues.push("altMissing");
    return { altText: null, altLength: 0, issues };
  }
  if (trimmed.length > THRESHOLDS.altMaxChars) issues.push("altOver");

  return { altText: trimmed, altLength: trimmed.length, issues };
}
