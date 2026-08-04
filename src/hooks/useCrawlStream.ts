"use client";

import { useEffect, useRef, useState } from "react";
import type { CrawlProgressEvent } from "@/lib/events";

/**
 * Subscribe to a crawl's SSE progress stream. Returns the latest event plus a
 * `live` flag (true while the crawl is running). Auto-closes on terminal events.
 */
export function useCrawlStream(crawlId: string) {
  const [event, setEvent] = useState<CrawlProgressEvent | null>(null);
  const [live, setLive] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource(`/api/crawls/${crawlId}/stream`);
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        const evt = JSON.parse(e.data) as CrawlProgressEvent;
        setEvent(evt);
        setLive(evt.status === "running" || evt.type === "progress");
        if (["done", "failed", "stopped"].includes(evt.type)) {
          setLive(false);
          es.close();
        }
      } catch {
        /* ignore */
      }
    };
    es.onerror = () => {
      setLive(false);
    };

    return () => es.close();
  }, [crawlId]);

  return { event, live };
}
