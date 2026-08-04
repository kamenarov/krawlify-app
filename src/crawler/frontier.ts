import { normalizeUrl, urlHash } from "./url";

export interface FrontierItem {
  url: string;
  depth: number;
}

/**
 * In-memory crawl frontier: a FIFO work queue plus a seen-set for dedupe.
 * Enforces maxDepth (whether to enqueue deeper links) and maxUrls (a hard cap on
 * how many URLs are ever admitted). The seen-set holds URL hashes, not full URLs,
 * to bound memory on large crawls.
 */
export class Frontier {
  private queue: FrontierItem[] = [];
  private seen = new Set<string>();
  private admitted = 0;

  constructor(
    private readonly maxDepth: number,
    private readonly maxUrls: number,
  ) {}

  /** Add a normalised URL if unseen and within limits. Returns true if admitted. */
  add(rawUrl: string, depth: number, base?: string): boolean {
    if (depth > this.maxDepth) return false;
    const url = normalizeUrl(rawUrl, base);
    if (!url) return false;
    const h = urlHash(url);
    if (this.seen.has(h)) return false;
    if (this.admitted >= this.maxUrls) return false;
    this.seen.add(h);
    this.admitted += 1;
    this.queue.push({ url, depth });
    return true;
  }

  /** Mark a URL as seen without enqueuing (e.g. external links we won't crawl). */
  markSeen(url: string): void {
    this.seen.add(urlHash(url));
  }

  has(url: string): boolean {
    return this.seen.has(urlHash(url));
  }

  next(): FrontierItem | undefined {
    return this.queue.shift();
  }

  get pending(): number {
    return this.queue.length;
  }

  get admittedCount(): number {
    return this.admitted;
  }

  get atCapacity(): boolean {
    return this.admitted >= this.maxUrls;
  }
}
