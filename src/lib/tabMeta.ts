// Client-safe tab metadata (labels, nav order, filter presets). Kept separate from
// tabs.ts so the UI never pulls Prisma into the client bundle.

export interface FilterPreset {
  key: string;
  label: string;
}

export interface TabMeta {
  key: string;
  label: string;
  filters: FilterPreset[];
}

const STATUS_FILTERS: FilterPreset[] = [
  { key: "all", label: "All" },
  { key: "2xx", label: "2xx Success" },
  { key: "3xx", label: "3xx Redirect" },
  { key: "4xx", label: "4xx Client Error" },
  { key: "5xx", label: "5xx Server Error" },
  { key: "noresponse", label: "No Response" },
];

export const TAB_META: TabMeta[] = [
  { key: "internal", label: "Internal", filters: STATUS_FILTERS },
  { key: "external", label: "External", filters: STATUS_FILTERS },
  { key: "response-codes", label: "Response Codes", filters: STATUS_FILTERS },
  {
    key: "titles",
    label: "Page Titles",
    filters: [
      { key: "all", label: "All" },
      { key: "missing", label: "Missing" },
      { key: "duplicate", label: "Duplicate" },
      { key: "over", label: "Over 60 chars" },
      { key: "under", label: "Under 30 chars" },
      { key: "multiple", label: "Multiple" },
    ],
  },
  {
    key: "meta",
    label: "Meta Description",
    filters: [
      { key: "all", label: "All" },
      { key: "missing", label: "Missing" },
      { key: "duplicate", label: "Duplicate" },
      { key: "over", label: "Over 160 chars" },
      { key: "under", label: "Under 70 chars" },
      { key: "multiple", label: "Multiple" },
    ],
  },
  {
    key: "headings",
    label: "Headings (H1–H6)",
    filters: [
      { key: "all", label: "All" },
      { key: "h1Missing", label: "H1 Missing" },
      { key: "h1Duplicate", label: "H1 Duplicate" },
      { key: "h1Multiple", label: "H1 Multiple" },
    ],
  },
  {
    key: "directives",
    label: "Directives",
    filters: [
      { key: "all", label: "All" },
      { key: "canonicalMismatch", label: "Canonical Mismatch" },
      { key: "noindex", label: "Noindex" },
      { key: "canonicalised", label: "Canonicalised" },
    ],
  },
  {
    key: "images",
    label: "Images",
    filters: [
      { key: "all", label: "All" },
      { key: "altMissing", label: "Missing Alt" },
      { key: "altOver", label: "Alt > 100 chars" },
      { key: "broken", label: "Broken" },
    ],
  },
  {
    key: "broken-assets",
    label: "Broken Assets",
    filters: [
      { key: "all", label: "All" },
      { key: "img", label: "Images" },
      { key: "script", label: "Scripts" },
      { key: "stylesheet", label: "Stylesheets" },
      { key: "api", label: "API/Other" },
    ],
  },
  {
    key: "links",
    label: "Links",
    filters: [
      { key: "all", label: "All" },
      { key: "follow", label: "Follow" },
      { key: "nofollow", label: "Nofollow" },
      { key: "blank", label: 'target="_blank"' },
      { key: "internal", label: "Internal" },
      { key: "external", label: "External" },
    ],
  },
  { key: "redirects", label: "Redirects", filters: [{ key: "all", label: "All" }] },
  {
    key: "sitemaps",
    label: "Sitemaps",
    filters: [
      { key: "all", label: "All (in sitemap)" },
      { key: "orphan", label: "Orphan Pages" },
    ],
  },
  {
    key: "dates",
    label: "Dates",
    filters: [
      { key: "all", label: "All" },
      { key: "hasPublished", label: "Has Published (JSON-LD)" },
      { key: "hasModified", label: "Has Modified (JSON-LD)" },
      { key: "hasSitemapDate", label: "Has Sitemap lastmod" },
      { key: "noDates", label: "No Dates" },
    ],
  },
];

export const tabMetaByKey = (key: string) => TAB_META.find((t) => t.key === key);
