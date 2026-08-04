/**
 * Product identity, in one place so a rename is a one-line change rather than a grep.
 *
 * The mark and palette are shared with the Krawlify browser extension
 * (`crawer_extension`), which in turn wears kamenarov.dev's colours: violet #8b5cf6 →
 * purple #a855f7 on near-black. See <Logo /> and the brand layer in globals.css.
 */
export const PRODUCT_NAME = "Krawlify";
export const PRODUCT_TAGLINE = "SEO Crawler & Audit";
/** Public site, advertised in the crawler's User-Agent so webmasters can identify it. */
export const PRODUCT_URL = "https://krawlify.com";
/**
 * Hosted ws_cdp relay — the default remote browser for bot-protection bypass.
 *
 * It is a CDP endpoint (`browserConnection: "cdp"`) and it is multi-tenant, so the Bearer
 * token is not a server password but the identity of one user's Chrome: the same token
 * their Krawlify extension is configured with. See BrowserFetcher in src/crawler/browser.ts.
 *
 * This is only ever used to PRE-FILL the new-crawl form. The value still has to be stored
 * on the crawl itself — bot-protection settings are never resolved at run time, so an
 * existing crawl keeps working (and reproduces) even if this constant changes.
 */
export const PRODUCT_RELAY_URL = "https://alpha.krawlify.com";
export const PRODUCT_DESCRIPTION =
  "High-performance website crawler and SEO audit platform.";

/** Brand colours, for the few places that need them outside CSS (SVG, meta theme-color). */
export const BRAND = {
  violet: "#8b5cf6",
  purple: "#a855f7",
  ink: "#15141f",
} as const;
