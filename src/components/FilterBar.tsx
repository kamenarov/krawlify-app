"use client";

import type { FilterPreset } from "@/lib/tabMeta";

interface Props {
  filters: FilterPreset[];
  active: string;
  onChange: (key: string) => void;
  search: string;
  onSearch: (s: string) => void;
  total: number;
}

export function FilterBar({ filters, active, onChange, search, onSearch, total }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b bg-white px-3 py-2">
      <div className="flex flex-wrap gap-1">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => onChange(f.key)}
            className={`rounded px-2.5 py-1 text-xs font-medium ${
              active === f.key ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="ml-auto flex items-center gap-3">
        <span className="tabular text-xs text-gray-500">{total.toLocaleString()} rows</span>
        <input
          type="search"
          placeholder="Filter URLs…"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          className="w-48 rounded border px-2.5 py-1 text-xs"
        />
      </div>
    </div>
  );
}
