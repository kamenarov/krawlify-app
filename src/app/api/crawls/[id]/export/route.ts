import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";
import { authorizeCrawl } from "@/lib/ownership";
import { queryTab, TABS } from "@/lib/tabs";
import { TAB_COLUMNS, cellValue, type ColumnDef } from "@/lib/columns";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const EXPORT_PAGE_SIZE = 1000;

/** Async generator yielding all rows for a tab in pages (keeps memory flat). */
async function* iterateRows(crawlId: string, tab: string, filter: string) {
  let page = 1;
  for (;;) {
    const { rows } = await queryTab(prisma, { crawlId, tab, filter, page, pageSize: EXPORT_PAGE_SIZE });
    if (rows.length === 0) break;
    for (const r of rows) yield r as Record<string, unknown>;
    if (rows.length < EXPORT_PAGE_SIZE) break;
    page += 1;
  }
}

function csvEscape(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  const crawlId = await authorizeCrawl(id);
  if (!crawlId) return new Response("Not found", { status: 404 });

  const url = new URL(req.url);
  const tab = url.searchParams.get("tab") ?? "internal";
  const filter = url.searchParams.get("filter") ?? "all";
  const format = url.searchParams.get("format") ?? "csv";

  // Master export: every tab as its own sheet (xlsx) — only meaningful for xlsx.
  const isMaster = tab === "all";

  if (format === "xlsx") {
    const wb = new ExcelJS.Workbook();
    const tabs = isMaster ? Object.keys(TABS) : [tab];
    for (const t of tabs) {
      const cols: ColumnDef[] = TAB_COLUMNS[t] ?? [];
      if (cols.length === 0) continue;
      const sheet = wb.addWorksheet(t.slice(0, 31));
      sheet.columns = cols.map((c) => ({ header: c.header, key: c.key, width: Math.min(80, (c.width ?? 120) / 7) }));
      for await (const row of iterateRows(crawlId, t, isMaster ? "all" : filter)) {
        sheet.addRow(Object.fromEntries(cols.map((c) => [c.key, cellValue(row, c.key)])));
      }
    }
    const buffer = await wb.xlsx.writeBuffer();
    return new Response(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="crawl-${crawlId}-${tab}.xlsx"`,
      },
    });
  }

  // CSV (streamed).
  const cols = TAB_COLUMNS[tab] ?? [];
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(cols.map((c) => csvEscape(c.header)).join(",") + "\n"));
      for await (const row of iterateRows(crawlId, tab, filter)) {
        const line = cols.map((c) => csvEscape(cellValue(row, c.key))).join(",");
        controller.enqueue(encoder.encode(line + "\n"));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="crawl-${crawlId}-${tab}.csv"`,
    },
  });
}
