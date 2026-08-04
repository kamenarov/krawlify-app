// SEO length thresholds. Centralised so they can be tuned in one place and
// referenced by both the auditors and the UI labels.
export const THRESHOLDS = {
  title: { minChars: 30, maxChars: 60, maxPixels: 561 },
  metaDesc: { minChars: 70, maxChars: 160, maxPixels: 985 },
  altMaxChars: 100,
} as const;
