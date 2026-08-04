"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useCrawlStream } from "@/hooks/useCrawlStream";
import { TAB_META } from "@/lib/tabMeta";
import { ISSUE_CATEGORIES } from "@/lib/events";
import { StatusChart } from "./StatusChart";
import { StatusBadge } from "./StatusBadge";
import { ThemeToggle } from "./ThemeToggle";
import { Logo } from "./Logo";

const SEV_COLOR: Record<string, string> = {
  error: "text-red-600",
  warning: "text-orange-600",
  notice: "text-gray-500",
};

export function CrawlChrome({
  crawlId,
  seedUrl,
  initialStatus,
  children,
}: {
  crawlId: string;
  seedUrl: string;
  initialStatus: string;
  children: React.ReactNode;
}) {
  const { event, live } = useCrawlStream(crawlId);
  const [stopping, setStopping] = useState(false);
  const pathname = usePathname();

  const status = event?.status ?? initialStatus;
  const totalFound = event?.totalFound ?? 0;
  const totalCrawled = event?.totalCrawled ?? 0;
  const pct = totalFound > 0 ? Math.min(100, Math.round((totalCrawled / totalFound) * 100)) : 0;
  const issueCounts = event?.issueCounts ?? {};

  async function stop() {
    setStopping(true);
    await fetch(`/api/crawls/${crawlId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "stop" }),
    });
  }

  const activeTab = TAB_META.find((t) => pathname?.endsWith(`/${t.key}`))?.key ?? "internal";

  return (
    <div className="flex h-screen flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b bg-white px-4 py-2.5">
        <div className="flex items-center gap-3 overflow-hidden">
          <Link href="/" className="flex shrink-0 items-center gap-2 text-sm text-blue-600 hover:underline">
            <Logo size={22} />
            <span>← Crawls</span>
          </Link>
          <span className="truncate text-sm font-medium" title={seedUrl}>
            {seedUrl}
          </span>
          <StatusBadge status={status} />
          {live && <span className="text-xs text-gray-400">{event?.currentUrl}</span>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* Opens the new-crawl form pre-filled with THIS crawl's settings, so they can
              be revised before starting the re-run. */}
          <Link
            href={`/crawls/new?from=${crawlId}`}
            className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Redo crawl
          </Link>
          {(status === "running" || status === "queued") && (
            <button
              onClick={stop}
              disabled={stopping}
              className="rounded border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              {stopping ? "Stopping…" : "Stop crawl"}
            </button>
          )}
          <ThemeToggle />
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="flex w-64 flex-col gap-4 overflow-y-auto border-r bg-white p-4">
          <div>
            <div className="mb-1 flex justify-between text-xs text-gray-500">
              <span>Progress</span>
              <span className="tabular">
                {totalCrawled.toLocaleString()} / {totalFound.toLocaleString()}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-blue-600 transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          <div>
            <h3 className="mb-1 text-xs font-semibold uppercase text-gray-400">Response Codes</h3>
            <StatusChart counts={event?.byStatusClass ?? {}} />
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase text-gray-400">Issues</h3>
            <ul className="space-y-1 text-sm">
              {ISSUE_CATEGORIES.filter((c) => (issueCounts[c.key] ?? 0) > 0).map((c) => (
                <li key={c.key} className="flex items-center justify-between">
                  <span className={SEV_COLOR[c.severity]}>{c.label}</span>
                  <span className="tabular font-medium">{issueCounts[c.key].toLocaleString()}</span>
                </li>
              ))}
              {ISSUE_CATEGORIES.every((c) => (issueCounts[c.key] ?? 0) === 0) && (
                <li className="text-xs text-gray-400">No issues detected yet</li>
              )}
            </ul>
          </div>
        </aside>

        {/* Main */}
        <main className="flex flex-1 flex-col overflow-hidden">
          {/* Tab nav */}
          <nav className="flex gap-1 overflow-x-auto border-b bg-white px-3 py-2">
            {TAB_META.map((t) => (
              <Link
                key={t.key}
                href={`/crawls/${crawlId}/${t.key}`}
                className={`whitespace-nowrap rounded px-3 py-1.5 text-sm ${
                  activeTab === t.key ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {t.label}
              </Link>
            ))}
          </nav>
          <div className="flex-1 overflow-hidden">{children}</div>
        </main>
      </div>
    </div>
  );
}
