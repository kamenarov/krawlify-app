import { BRAND, PRODUCT_NAME } from "@/lib/brand";

/**
 * The Krawlify mark: a K on a rounded near-black tile, drawn in the violet→purple sweep.
 *
 * Geometry is lifted verbatim from the browser extension's icon generator
 * (`crawer_extension/tools/make-icons.mjs`), which draws the K analytically as a stem plus
 * two arms rather than as glyph outlines — that is what keeps it legible at 16px. Those
 * coordinates are on a unit square there; here they are scaled by 32 for the viewBox, so
 * the two marks stay pixel-identical as the source of truth moves between them.
 *
 * The gradient id is a constant rather than a generated one: every instance paints the
 * same gradient, so duplicate defs on a page are harmless and this keeps the component
 * usable from server components (no useId, no "use client").
 */
export function Logo({ size = 28, className = "" }: { size?: number; className?: string }) {
  const stroke = 0.17 * 32; // 2 × the 0.085 half-thickness the generator uses

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      role="img"
      aria-label={`${PRODUCT_NAME} logo`}
    >
      <defs>
        <linearGradient id="krawlify-mark" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={BRAND.violet} />
          <stop offset="1" stopColor={BRAND.purple} />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="7.04" fill={BRAND.ink} />
      <g
        stroke="url(#krawlify-mark)"
        strokeWidth={stroke}
        strokeLinecap="round"
        fill="none"
      >
        <path d="M9.6 7.04 V24.96" />
        <path d="M10.56 16.64 L23.04 7.04" />
        <path d="M10.56 16 L23.04 24.96" />
      </g>
    </svg>
  );
}

/** Mark + product name, for headers and the footer. */
export function Wordmark({
  size = 28,
  className = "",
  tagline,
}: {
  size?: number;
  className?: string;
  tagline?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <Logo size={size} />
      <span className="leading-tight">
        <span className="block font-semibold tracking-tight">{PRODUCT_NAME}</span>
        {tagline && <span className="block text-xs text-gray-500">{tagline}</span>}
      </span>
    </span>
  );
}
