import { describe, it, expect } from "vitest";
import { extractJsonLdDates } from "./jsonld";

describe("extractJsonLdDates", () => {
  it("reads dates from a flat Article object", () => {
    const r = extractJsonLdDates([
      JSON.stringify({
        "@type": "Article",
        datePublished: "2024-01-15T10:00:00Z",
        dateModified: "2024-02-20",
      }),
    ]);
    expect(r.datePublished?.toISOString().slice(0, 10)).toBe("2024-01-15");
    expect(r.dateModified?.toISOString().slice(0, 10)).toBe("2024-02-20");
  });

  it("walks into the @graph envelope", () => {
    const r = extractJsonLdDates([
      JSON.stringify({
        "@context": "https://schema.org",
        "@graph": [{ "@type": "WebSite" }, { "@type": "BlogPosting", datePublished: "2023-06-01" }],
      }),
    ]);
    expect(r.datePublished?.toISOString().slice(0, 10)).toBe("2023-06-01");
  });

  it("falls back to dateCreated/uploadDate for published", () => {
    const r = extractJsonLdDates([JSON.stringify({ uploadDate: "2022-12-31" })]);
    expect(r.datePublished?.toISOString().slice(0, 10)).toBe("2022-12-31");
  });

  it("ignores malformed JSON blocks", () => {
    const r = extractJsonLdDates(["{ not valid json", JSON.stringify({ datePublished: "2025-03-03" })]);
    expect(r.datePublished?.toISOString().slice(0, 10)).toBe("2025-03-03");
  });

  it("returns nulls when no dates present", () => {
    const r = extractJsonLdDates([JSON.stringify({ "@type": "Organization", name: "Acme" })]);
    expect(r.datePublished).toBeNull();
    expect(r.dateModified).toBeNull();
  });
});
