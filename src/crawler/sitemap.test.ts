import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseSitemapDoc, parseDate } from "./sitemap";

const fixture = (name: string) => readFileSync(join(__dirname, "__fixtures__", name), "utf8");

describe("parseSitemapDoc", () => {
  it("parses a Rank Math sitemap index with multiple child sitemaps", () => {
    const doc = parseSitemapDoc(fixture("rankmath-index.xml"));
    expect(doc?.kind).toBe("index");
    if (doc?.kind !== "index") return;
    expect(doc.sitemaps).toEqual([
      "https://example.com/post-sitemap.xml",
      "https://example.com/page-sitemap.xml",
    ]);
  });

  it("parses a Rank Math urlset (with stylesheet PI, image ns, trailing comment)", () => {
    const doc = parseSitemapDoc(fixture("rankmath-post-sitemap.xml"));
    expect(doc?.kind).toBe("urlset");
    if (doc?.kind !== "urlset") return;
    expect(doc.urls.map((u) => u.loc)).toEqual([
      "https://example.com/",
      "https://example.com/inner/",
      "https://example.com/about/",
      "https://example.com/contact/",
    ]);
    // lastmod parsed to a Date
    expect(doc.urls[0].lastmod?.toISOString()).toBe("2023-07-09T12:29:15.000Z");
  });

  it("handles a single <url> entry (not an array)", () => {
    const xml = `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url><loc>https://x.com/only</loc><lastmod>2024-01-01</lastmod></url></urlset>`;
    const doc = parseSitemapDoc(xml);
    expect(doc?.kind).toBe("urlset");
    if (doc?.kind !== "urlset") return;
    expect(doc.urls).toHaveLength(1);
    expect(doc.urls[0].loc).toBe("https://x.com/only");
  });

  it("handles a single <sitemap> entry in an index", () => {
    const xml = `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <sitemap><loc>https://x.com/a-sitemap.xml</loc></sitemap></sitemapindex>`;
    const doc = parseSitemapDoc(xml);
    expect(doc?.kind).toBe("index");
    if (doc?.kind !== "index") return;
    expect(doc.sitemaps).toEqual(["https://x.com/a-sitemap.xml"]);
  });

  it("tolerates namespace-prefixed roots (<sm:urlset>)", () => {
    const xml = `<sm:urlset xmlns:sm="http://www.sitemaps.org/schemas/sitemap/0.9">
      <sm:url><loc>https://x.com/p</loc></sm:url></sm:urlset>`;
    const doc = parseSitemapDoc(xml);
    // root detected by local name; url entries read loc directly
    expect(doc?.kind).toBe("urlset");
  });

  it("returns null for non-sitemap XML", () => {
    expect(parseSitemapDoc("<rss><channel></channel></rss>")).toBeNull();
    expect(parseSitemapDoc("not xml at all <<<")).toBeNull();
  });

  it("parseDate handles W3C datetime, plain date, and rejects junk", () => {
    expect(parseDate("2023-07-09T12:29:15+00:00")?.toISOString()).toBe("2023-07-09T12:29:15.000Z");
    expect(parseDate("2024-02-20")?.toISOString().slice(0, 10)).toBe("2024-02-20");
    expect(parseDate("not-a-date")).toBeNull();
    expect(parseDate(undefined)).toBeNull();
  });
});
