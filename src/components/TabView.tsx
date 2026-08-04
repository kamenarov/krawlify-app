"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { DataTable } from "./DataTable";
import { FilterBar } from "./FilterBar";
import { ExportButton } from "./ExportButton";
import { TAB_COLUMNS } from "@/lib/columns";
import { tabMetaByKey } from "@/lib/tabMeta";

const PAGE_SIZE = 100;

/**
 * Tab data view: owns filter/search/sort state, fetches paginated rows from the data
 * API, and feeds the virtualized DataTable. Implements infinite scroll by appending
 * subsequent pages as the user reaches the bottom. Re-fetches from page 1 whenever
 * the filter, search, or sort changes.
 */
export function TabView({ tab }: { tab: string }) {
  const params = useParams<{ id: string }>();
  const crawlId = params.id;
  const meta = tabMetaByKey(tab);
  const columns = TAB_COLUMNS[tab] ?? [];

  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState(columns[0]?.key ?? "url");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [loading, setLoading] = useState(false);
  const pageRef = useRef(1);
  const reqRef = useRef(0);

  const load = useCallback(
    async (reset: boolean) => {
      const seq = ++reqRef.current;
      setLoading(true);
      const page = reset ? 1 : pageRef.current + 1;
      const qs = new URLSearchParams({
        tab,
        filter,
        search,
        sortBy,
        sortDir,
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      const res = await fetch(`/api/crawls/${crawlId}/data?${qs}`);
      const data = await res.json().catch(() => ({ rows: [], total: 0 }));
      if (seq !== reqRef.current) return; // stale response, ignore
      pageRef.current = page;
      setTotal(data.total ?? 0);
      setRows((prev) => (reset ? data.rows : [...prev, ...data.rows]));
      setLoading(false);
    },
    [crawlId, tab, filter, search, sortBy, sortDir],
  );

  // Reset + reload whenever filters/sort/search change.
  useEffect(() => {
    pageRef.current = 1;
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, search, sortBy, sortDir, tab]);

  const onReachEnd = useCallback(() => {
    if (loading) return;
    if (rows.length >= total) return;
    void load(false);
  }, [loading, rows.length, total, load]);

  const onSort = (key: string) => {
    if (sortBy === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(key);
      setSortDir("asc");
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b bg-white px-3 py-2">
        <h2 className="text-sm font-semibold">{meta?.label ?? tab}</h2>
        <div className="ml-auto">
          <ExportButton crawlId={crawlId} tab={tab} filter={filter} />
        </div>
      </div>
      <FilterBar
        filters={meta?.filters ?? [{ key: "all", label: "All" }]}
        active={filter}
        onChange={setFilter}
        search={search}
        onSearch={setSearch}
        total={total}
      />
      <div className="flex-1 overflow-hidden">
        {columns.length === 0 ? (
          <div className="p-6 text-sm text-gray-500">No columns defined for this tab.</div>
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            sortBy={sortBy}
            sortDir={sortDir}
            onSort={onSort}
            onReachEnd={onReachEnd}
            loading={loading}
          />
        )}
      </div>
    </div>
  );
}
