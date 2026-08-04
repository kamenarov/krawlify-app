"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import type { StatusClassCounts } from "@/lib/events";

const COLORS: Record<string, string> = {
  "2": "#16a34a",
  "3": "#2563eb",
  "4": "#f97316",
  "5": "#dc2626",
  "0": "#6b7280",
};
const LABELS: Record<string, string> = {
  "2": "2xx",
  "3": "3xx",
  "4": "4xx",
  "5": "5xx",
  "0": "No resp",
};

export function StatusChart({ counts }: { counts: StatusClassCounts }) {
  const data = Object.entries(counts)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ name: LABELS[k] ?? k, value: v, key: k }));

  if (data.length === 0) {
    return <div className="py-6 text-center text-xs text-gray-400">No responses yet</div>;
  }

  return (
    <div className="h-40">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={32} outerRadius={56} paddingAngle={2}>
            {data.map((d) => (
              <Cell key={d.key} fill={COLORS[d.key] ?? "#9ca3af"} />
            ))}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
      <div className="mt-1 flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs">
        {data.map((d) => (
          <span key={d.key} className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: COLORS[d.key] }} />
            {d.name}: <span className="tabular font-medium">{d.value.toLocaleString()}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
