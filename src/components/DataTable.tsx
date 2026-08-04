"use client";

import { useRef, useEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { ColumnDef } from "@/lib/columns";
import { cellValue } from "@/lib/columns";

interface Props {
  columns: ColumnDef[];
  rows: Record<string, unknown>[];
  sortBy: string;
  sortDir: "asc" | "desc";
  onSort: (key: string) => void;
  onReachEnd: () => void;
  loading: boolean;
}

const ROW_HEIGHT = 34;

/**
 * Virtualized data grid. Only the visible row window is rendered, so a single page
 * of up to ~1000 rows (or an accumulated infinite-scroll list) stays smooth. Calls
 * onReachEnd when the user scrolls near the bottom so the parent can fetch more.
 */
export function DataTable({ columns, rows, sortBy, sortDir, onSort, onReachEnd, loading }: Props) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  const items = virtualizer.getVirtualItems();
  const lastItem = items.at(-1);

  useEffect(() => {
    if (!lastItem) return;
    if (lastItem.index >= rows.length - 20 && !loading) onReachEnd();
  }, [lastItem, rows.length, loading, onReachEnd]);

  const totalWidth = columns.reduce((sum, c) => sum + (c.width ?? 140), 0);

  return (
    <div ref={parentRef} className="h-full overflow-auto bg-white">
      <div style={{ width: totalWidth, minWidth: "100%" }}>
        {/* Header */}
        <div className="sticky top-0 z-10 flex border-b bg-gray-50 text-xs font-semibold uppercase text-gray-600">
          {columns.map((c) => (
            <button
              key={c.key}
              onClick={() => onSort(c.key)}
              style={{ width: c.width ?? 140 }}
              className="flex shrink-0 items-center gap-1 px-3 py-2 text-left hover:bg-gray-100"
            >
              <span className="truncate">{c.header}</span>
              {sortBy === c.key && <span>{sortDir === "asc" ? "▲" : "▼"}</span>}
            </button>
          ))}
        </div>

        {/* Virtualized rows */}
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {items.map((vi) => {
            const row = rows[vi.index];
            return (
              <div
                key={vi.key}
                className="absolute left-0 flex border-b text-sm hover:bg-blue-50/40"
                style={{ top: 0, transform: `translateY(${vi.start}px)`, height: ROW_HEIGHT }}
              >
                {columns.map((c) => {
                  const val = cellValue(row, c.key);
                  return (
                    <div
                      key={c.key}
                      style={{ width: c.width ?? 140 }}
                      className="shrink-0 truncate px-3 py-1.5 tabular"
                      title={String(val)}
                    >
                      {(c.key === "url" || c.key === "sourceUrl" || c.key === "targetUrl") &&
                      String(val).startsWith("http") ? (
                        <a
                          href={String(val)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          {String(val)}
                        </a>
                      ) : (
                        String(val)
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
