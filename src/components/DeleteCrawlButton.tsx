"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Deletes a crawl (report) and its data via DELETE /api/crawls/:id, then refreshes
 * the listing. Stops propagation so it works inside a clickable table row.
 */
export function DeleteCrawlButton({ crawlId, seedUrl }: { crawlId: string; seedUrl: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Delete the crawl of ${seedUrl}? This permanently removes all its data.`)) return;
    setBusy(true);
    const res = await fetch(`/api/crawls/${crawlId}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      alert((await res.json().catch(() => ({}))).error ?? "Failed to delete crawl");
      return;
    }
    router.refresh();
  }

  return (
    <button
      onClick={onDelete}
      disabled={busy}
      className="text-xs text-red-600 hover:underline disabled:opacity-50"
    >
      {busy ? "Deleting…" : "Delete"}
    </button>
  );
}
