import { describe, it, expect } from "vitest";
import { auditTitles } from "./titles";
import { auditMeta } from "./meta";
import { auditHeadings } from "./headings";
import { auditDirectives } from "./directives";
import { auditImageAlt } from "./images";
import { normalizeUrl, isInternalUrl, sameHost } from "../url";

describe("auditTitles", () => {
  it("flags missing title", () => {
    expect(auditTitles([]).issues).toContain("missing");
    expect(auditTitles(["   "]).issues).toContain("missing");
  });
  it("flags multiple titles", () => {
    const r = auditTitles(["A good descriptive page title here", "Second"]);
    expect(r.issues).toContain("multiple");
    expect(r.titleCount).toBe(2);
  });
  it("flags over-length title", () => {
    const long = "x".repeat(80);
    expect(auditTitles([long]).issues).toContain("over");
  });
  it("flags under-length title", () => {
    expect(auditTitles(["short"]).issues).toContain("under");
  });
  it("accepts a well-formed title", () => {
    const r = auditTitles(["A reasonably sized SEO page title example"]);
    expect(r.issues).toEqual([]);
    expect(r.titleLength).toBeGreaterThan(0);
    expect(r.titlePixelWidth).toBeGreaterThan(0);
  });
});

describe("auditMeta", () => {
  it("flags missing meta", () => {
    expect(auditMeta([]).issues).toContain("missing");
  });
  it("flags over-length meta", () => {
    expect(auditMeta(["x".repeat(200)]).issues).toContain("over");
  });
  it("flags under-length meta", () => {
    expect(auditMeta(["too short"]).issues).toContain("under");
  });
});

describe("auditHeadings", () => {
  const empty = { h1: [], h2: [], h3: [], h4: [], h5: [], h6: [] };
  it("flags missing H1", () => {
    expect(auditHeadings({ ...empty, h2: ["Sub"] }).issues).toContain("h1Missing");
  });
  it("flags multiple H1", () => {
    expect(auditHeadings({ ...empty, h1: ["One", "Two"] }).issues).toContain("h1Multiple");
  });
  it("accepts a single H1 and counts all levels", () => {
    const r = auditHeadings({
      h1: ["The Only H1"],
      h2: ["H2 a", "H2 b"],
      h3: ["H3 a"],
      h4: [],
      h5: ["H5 a", "H5 b", "H5 c"],
      h6: [],
    });
    expect(r.issues).toEqual([]);
    expect(r.counts.h1).toBe(1);
    expect(r.counts.h2).toBe(2);
    expect(r.counts.h3).toBe(1);
    expect(r.counts.h5).toBe(3);
    expect(r.levels.h2).toEqual(["H2 a", "H2 b"]);
  });
  it("trims and drops empty headings", () => {
    const r = auditHeadings({ ...empty, h1: ["  Title  "], h3: ["", "  ", "Real"] });
    expect(r.levels.h1).toEqual(["Title"]);
    expect(r.counts.h3).toBe(1);
  });
});

describe("auditDirectives", () => {
  it("detects canonical mismatch", () => {
    const r = auditDirectives({
      pageUrl: "https://x.com/a",
      canonicalRaw: "https://x.com/b",
      metaRobots: null,
      xRobotsTag: null,
      statusClass: 2,
    });
    expect(r.canonicalMismatch).toBe(true);
    expect(r.indexability).toBe("canonicalised");
  });
  it("treats self-canonical as indexable", () => {
    const r = auditDirectives({
      pageUrl: "https://x.com/a",
      canonicalRaw: "https://x.com/a",
      metaRobots: null,
      xRobotsTag: null,
      statusClass: 2,
    });
    expect(r.canonicalMismatch).toBe(false);
    expect(r.indexability).toBe("indexable");
  });
  it("honours noindex over canonical", () => {
    const r = auditDirectives({
      pageUrl: "https://x.com/a",
      canonicalRaw: "https://x.com/b",
      metaRobots: "noindex, follow",
      xRobotsTag: null,
      statusClass: 2,
    });
    expect(r.indexability).toBe("noindex");
    expect(r.issues).toContain("noindex");
  });
});

describe("auditImageAlt", () => {
  it("flags missing alt", () => {
    expect(auditImageAlt("").issues).toContain("altMissing");
    expect(auditImageAlt(undefined).issues).toContain("altMissing");
  });
  it("flags alt over 100 chars", () => {
    expect(auditImageAlt("a".repeat(120)).issues).toContain("altOver");
  });
  it("accepts a normal alt", () => {
    expect(auditImageAlt("A photo of a cat").issues).toEqual([]);
  });
});

describe("url normalisation", () => {
  it("strips fragments and sorts query", () => {
    expect(normalizeUrl("https://x.com/a?b=2&a=1#frag")).toBe("https://x.com/a?a=1&b=2");
  });
  it("lowercases host and drops default port", () => {
    expect(normalizeUrl("https://X.COM:443/Path")).toBe("https://x.com/Path");
  });
  it("resolves relative URLs against base", () => {
    expect(normalizeUrl("/about", "https://x.com/dir/page")).toBe("https://x.com/about");
  });
  it("rejects non-http protocols", () => {
    expect(normalizeUrl("mailto:a@b.com")).toBeNull();
    expect(normalizeUrl("javascript:void(0)")).toBeNull();
  });
  it("classifies internal vs external respecting www", () => {
    expect(sameHost("www.x.com", "x.com")).toBe(true);
    expect(isInternalUrl("https://www.x.com/a", "x.com")).toBe(true);
    expect(isInternalUrl("https://other.com/a", "x.com")).toBe(false);
  });
});
