"use client";

import { useState } from "react";

export function ExportButton({
  crawlId,
  tab,
  filter,
}: {
  crawlId: string;
  tab: string;
  filter: string;
}) {
  const [open, setOpen] = useState(false);

  const href = (format: string, t = tab) =>
    `/api/crawls/${crawlId}/export?tab=${t}&filter=${filter}&format=${format}`;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700"
      >
        Export ▾
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-56 rounded border bg-white py-1 text-sm shadow-lg">
          <a href={href("csv")} className="block px-3 py-1.5 hover:bg-gray-50">
            This tab → CSV
          </a>
          <a href={href("xlsx")} className="block px-3 py-1.5 hover:bg-gray-50">
            This tab → Excel
          </a>
          <div className="my-1 border-t" />
          <a href={href("xlsx", "all")} className="block px-3 py-1.5 hover:bg-gray-50">
            Master export (all tabs) → Excel
          </a>
        </div>
      )}
    </div>
  );
}
