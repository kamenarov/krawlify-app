import { normalizeUrl } from "../url";

export interface DirectiveAudit {
  canonicalUrl: string | null;
  canonicalMismatch: boolean;
  metaRobots: string | null;
  xRobotsTag: string | null;
  indexability: "indexable" | "noindex" | "canonicalised" | "non-indexable";
  indexabilityReason: string | null;
  issues: string[]; // "canonicalMismatch" | "noindex"
}

/**
 * Resolve directives + indexability for a page.
 * - canonicalMismatch: canonical present and points to a different (normalised) URL.
 * - indexability follows precedence: noindex (meta/x-robots) > canonicalised > indexable.
 */
export function auditDirectives(params: {
  pageUrl: string;
  canonicalRaw: string | null;
  metaRobots: string | null;
  xRobotsTag: string | null;
  statusClass: number;
}): DirectiveAudit {
  const { pageUrl, canonicalRaw, metaRobots, xRobotsTag, statusClass } = params;
  const issues: string[] = [];

  const robotsCombined = `${metaRobots ?? ""} ${xRobotsTag ?? ""}`.toLowerCase();
  const isNoindex = /\bnoindex\b/.test(robotsCombined);

  let canonicalUrl: string | null = null;
  let canonicalMismatch = false;
  if (canonicalRaw) {
    canonicalUrl = normalizeUrl(canonicalRaw, pageUrl);
    const self = normalizeUrl(pageUrl);
    if (canonicalUrl && self && canonicalUrl !== self) {
      canonicalMismatch = true;
      issues.push("canonicalMismatch");
    }
  }

  let indexability: DirectiveAudit["indexability"] = "indexable";
  let indexabilityReason: string | null = null;

  if (statusClass !== 2) {
    indexability = "non-indexable";
    indexabilityReason = "Non-200 response";
  } else if (isNoindex) {
    indexability = "noindex";
    indexabilityReason = "Noindex directive";
    issues.push("noindex");
  } else if (canonicalMismatch) {
    indexability = "canonicalised";
    indexabilityReason = "Canonicalised to another URL";
  }

  return {
    canonicalUrl,
    canonicalMismatch,
    metaRobots,
    xRobotsTag,
    indexability,
    indexabilityReason,
    issues,
  };
}
