import { describe, it, expect } from "vitest";
import { crawlConfigSchema } from "./events";

const base = { seedUrl: "https://example.com" };

/**
 * The bot-protection settings have no environment fallback — everything the run needs must
 * be on the crawl itself — so the schema is what enforces "you must fill the field in".
 */
describe("crawlConfigSchema — bot-protection settings come only from the crawl", () => {
  it("accepts a plain crawl with no browser settings", () => {
    const parsed = crawlConfigSchema.safeParse(base);
    expect(parsed.success).toBe(true);
  });

  it("ignores blank browser fields while the bypass is off", () => {
    const parsed = crawlConfigSchema.safeParse({
      ...base,
      bypassBotProtection: false,
      browserServer: "",
      browserAuth: "bearer",
      browserAuthToken: "",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects the bypass without an endpoint", () => {
    const parsed = crawlConfigSchema.safeParse({ ...base, bypassBotProtection: true });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].path).toEqual(["browserServer"]);
    }
  });

  it("names the right endpoint kind per connection mode", () => {
    const cdp = crawlConfigSchema.safeParse({
      ...base,
      bypassBotProtection: true,
      browserConnection: "cdp",
    });
    expect(cdp.success).toBe(false);
    if (!cdp.success) expect(cdp.error.issues[0].message).toMatch(/CDP endpoint/);
  });

  it("rejects bearer auth without a token", () => {
    const parsed = crawlConfigSchema.safeParse({
      ...base,
      bypassBotProtection: true,
      browserServer: "http://cloakbrowser:9222",
      browserConnection: "cdp",
      browserAuth: "bearer",
      browserAuthToken: "   ",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues[0].path).toEqual(["browserAuthToken"]);
  });

  it("rejects useProxy without a proxy server", () => {
    const parsed = crawlConfigSchema.safeParse({
      ...base,
      bypassBotProtection: true,
      browserServer: "ws://playwright:3001/",
      useProxy: true,
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues[0].path).toEqual(["proxyServer"]);
  });

  it("accepts a fully specified bypass crawl and keeps the values verbatim", () => {
    const parsed = crawlConfigSchema.safeParse({
      ...base,
      bypassBotProtection: true,
      browserConnection: "cdp",
      browserServer: "http://cloakbrowser:9222",
      browserAuth: "bearer",
      browserAuthToken: "  tok_abc  ",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.browserServer).toBe("http://cloakbrowser:9222");
      expect(parsed.data.browserAuthToken).toBe("tok_abc");
    }
  });
});
