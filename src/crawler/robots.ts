import robotsParser from "robots-parser";
import type { TextFetcher } from "./fetcher";

/**
 * robots.txt cache keyed by origin. Fetched at most once per origin per crawl via an
 * injected text fetcher (undici in normal mode, the browser context in bypass mode, so
 * the same IP/cookies are used). When robots.txt is unreachable we fail open (allow).
 */
export class RobotsCache {
  private cache = new Map<string, ReturnType<typeof robotsParser>>();
  private sitemaps = new Map<string, string[]>();

  constructor(
    private readonly userAgent: string,
    private readonly fetchText: TextFetcher,
  ) {}

  private async load(origin: string): Promise<ReturnType<typeof robotsParser>> {
    const cached = this.cache.get(origin);
    if (cached) return cached;

    const robotsUrl = `${origin}/robots.txt`;
    const content = (await this.fetchText(robotsUrl)) ?? "";

    const parser = robotsParser(robotsUrl, content);
    this.cache.set(origin, parser);
    this.sitemaps.set(origin, parser.getSitemaps() ?? []);
    return parser;
  }

  async isAllowed(url: string): Promise<boolean> {
    let origin: string;
    try {
      origin = new URL(url).origin;
    } catch {
      return true;
    }
    const parser = await this.load(origin);
    return parser.isAllowed(url, this.userAgent) ?? true;
  }

  /** Sitemap URLs declared in robots.txt for the given origin. */
  async getSitemaps(origin: string): Promise<string[]> {
    await this.load(origin);
    return this.sitemaps.get(origin) ?? [];
  }
}
