import { describe, expect, it, vi, beforeEach } from "vitest";

// The tool layer reaches for Postgres, Redis and BullMQ at import time. Stub those out so
// the dispatcher can be exercised on its own — what is under test here is the protocol
// and the argument handling, not the queries (those are the REST API's tests).
const findMany = vi.fn();
const findFirst = vi.fn();
const findUnique = vi.fn();
const createCrawl = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    crawl: { findMany, findFirst },
    issue: { findMany: vi.fn().mockResolvedValue([]) },
    user: { findUnique },
  },
}));
vi.mock("@/lib/redis", () => ({ redis: { set: vi.fn() } }));
vi.mock("@/lib/queue", () => ({ crawlQueue: { add: vi.fn() } }));
vi.mock("@/lib/crawlService", () => ({
  createCrawl: (...args: unknown[]) => createCrawl(...args),
  deleteCrawl: vi.fn(),
}));
const queryTab = vi.fn();
vi.mock("@/lib/tabs", () => ({ queryTab: (...args: unknown[]) => queryTab(...args) }));

const { handleMcpMessage } = await import("./server");
const { MCP_TOOLS } = await import("./tools");
const { LATEST_PROTOCOL_VERSION, negotiateProtocolVersion, RPC } = await import("./protocol");

const USER = "user_1";
const call = (method: string, params?: unknown, id: number | string = 1) =>
  handleMcpMessage({ jsonrpc: "2.0", id, method, params }, USER);

/** tools/call wraps its payload in a content array; pull the JSON back out. */
function toolText(res: unknown): string {
  const r = res as { result?: { content?: { text?: string }[]; isError?: boolean } };
  return r.result?.content?.[0]?.text ?? "";
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("protocol version negotiation", () => {
  it("echoes a version the server speaks", () => {
    expect(negotiateProtocolVersion("2024-11-05")).toBe("2024-11-05");
    expect(negotiateProtocolVersion("2025-03-26")).toBe("2025-03-26");
  });

  it("falls back to the latest for anything else", () => {
    expect(negotiateProtocolVersion("1999-01-01")).toBe(LATEST_PROTOCOL_VERSION);
    expect(negotiateProtocolVersion(undefined)).toBe(LATEST_PROTOCOL_VERSION);
    expect(negotiateProtocolVersion(42)).toBe(LATEST_PROTOCOL_VERSION);
  });
});

describe("handshake", () => {
  it("initialize advertises tools and returns server info", async () => {
    const res = await call("initialize", { protocolVersion: "2025-03-26", capabilities: {} });
    const result = (res as { result: Record<string, never> }).result;
    expect(result.protocolVersion).toBe("2025-03-26");
    expect(result.capabilities).toEqual({ tools: { listChanged: false } });
    expect(result.serverInfo).toMatchObject({ name: "krawlify" });
    expect(String(result.instructions)).toContain("start_crawl");
  });

  it("acknowledges notifications with no reply", async () => {
    const res = await handleMcpMessage(
      { jsonrpc: "2.0", method: "notifications/initialized" },
      USER,
    );
    expect(res).toBeNull();
  });

  it("answers ping", async () => {
    expect(await call("ping")).toEqual({ jsonrpc: "2.0", id: 1, result: {} });
  });

  it("rejects a non-JSON-RPC payload", async () => {
    const res = await handleMcpMessage({ hello: "world" }, USER);
    expect((res as { error: { code: number } }).error.code).toBe(RPC.invalidRequest);
  });

  it("reports unknown methods as method-not-found", async () => {
    const res = await call("does/not/exist");
    expect((res as { error: { code: number } }).error.code).toBe(RPC.methodNotFound);
  });

  it("returns empty lists for the capabilities it does not offer", async () => {
    expect(await call("resources/list")).toMatchObject({ result: { resources: [] } });
    expect(await call("prompts/list")).toMatchObject({ result: { prompts: [] } });
  });
});

describe("tools/list", () => {
  it("lists every registered tool with a JSON Schema", async () => {
    const res = await call("tools/list");
    const tools = (res as { result: { tools: Record<string, never>[] } }).result.tools;
    expect(tools).toHaveLength(MCP_TOOLS.length);
    for (const t of tools) {
      expect(typeof t.name).toBe("string");
      expect(String(t.description).length).toBeGreaterThan(20);
      expect((t.inputSchema as { type?: string }).type).toBe("object");
    }
  });

  it("flags the destructive tool so clients can prompt", async () => {
    const res = await call("tools/list");
    const tools = (res as { result: { tools: { name: string; annotations?: Record<string, unknown> }[] } })
      .result.tools;
    const del = tools.find((t) => t.name === "delete_crawl");
    expect(del?.annotations?.destructiveHint).toBe(true);
    expect(tools.find((t) => t.name === "list_crawls")?.annotations?.readOnlyHint).toBe(true);
  });
});

describe("tools/call", () => {
  it("runs a tool and returns its payload as JSON text", async () => {
    findMany.mockResolvedValue([{ id: "c1", seedUrl: "https://example.com", status: "done" }]);
    const res = await call("tools/call", { name: "list_crawls", arguments: { limit: 5 } });
    expect(JSON.parse(toolText(res))).toMatchObject({ count: 1, crawls: [{ id: "c1" }] });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: USER }, take: 5 }),
    );
  });

  it("applies defaults for omitted arguments", async () => {
    findMany.mockResolvedValue([]);
    await call("tools/call", { name: "list_crawls" });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 20 }));
  });

  it("scopes every query to the authenticated key owner", async () => {
    findFirst.mockResolvedValue(null);
    await call("tools/call", { name: "get_crawl", arguments: { crawlId: "c9" } });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "c9", userId: USER } }),
    );
  });

  it("reports a missing crawl as a readable tool error, not a crash", async () => {
    findFirst.mockResolvedValue(null);
    const res = await call("tools/call", { name: "get_crawl", arguments: { crawlId: "nope" } });
    const result = (res as { result: { isError: boolean } }).result;
    expect(result.isError).toBe(true);
    expect(toolText(res)).toContain("nope");
  });

  it("returns invalid arguments as a tool error the model can act on", async () => {
    const res = await call("tools/call", { name: "get_crawl", arguments: {} });
    expect((res as { result: { isError: boolean } }).result.isError).toBe(true);
    expect(toolText(res)).toContain("crawlId");
  });

  it("rejects an unknown tool name at the protocol level", async () => {
    const res = await call("tools/call", { name: "rm_rf", arguments: {} });
    expect((res as { error: { code: number } }).error.code).toBe(RPC.invalidParams);
  });

  it("validates start_crawl against the shared crawl config schema", async () => {
    const res = await call("tools/call", {
      name: "start_crawl",
      arguments: { seedUrl: "not-a-url" },
    });
    expect((res as { result: { isError: boolean } }).result.isError).toBe(true);
    expect(createCrawl).not.toHaveBeenCalled();
  });

  it("enforces the bot-protection cross-field rule from the REST API", async () => {
    const res = await call("tools/call", {
      name: "start_crawl",
      arguments: { seedUrl: "https://example.com", bypassBotProtection: true },
    });
    expect(toolText(res)).toContain("browserServer");
    expect(createCrawl).not.toHaveBeenCalled();
  });

  it("queues a valid crawl", async () => {
    createCrawl.mockResolvedValue("c_new");
    const res = await call("tools/call", {
      name: "start_crawl",
      arguments: { seedUrl: "https://example.com", maxUrls: 50 },
    });
    expect(JSON.parse(toolText(res))).toMatchObject({ id: "c_new", status: "queued" });
    expect(createCrawl).toHaveBeenCalledWith(USER, expect.objectContaining({ maxUrls: 50 }));
  });

  it("never exposes the crawl config, which holds browser and proxy credentials", async () => {
    findMany.mockResolvedValue([{ id: "c1", seedUrl: "https://example.com" }]);
    await call("tools/call", { name: "list_crawls" });
    const select = findMany.mock.calls[0][0].select;
    expect(select).not.toHaveProperty("config");
  });

  it("caps the result page size so a call cannot flood the model context", async () => {
    findFirst.mockResolvedValue({ id: "c1" });
    const res = await call("tools/call", {
      name: "get_crawl_results",
      arguments: { crawlId: "c1", pageSize: 5000 },
    });
    expect((res as { result: { isError: boolean } }).result.isError).toBe(true);
    expect(toolText(res)).toContain("pageSize");
  });

  it("strips empty fields and internal keys from result rows", async () => {
    findFirst.mockResolvedValue({ id: "c1" });
    queryTab.mockResolvedValue({
      rows: [
        {
          id: "p1",
          crawlId: "c1",
          url: "https://example.com",
          urlHash: "abc",
          title: null,
          metaDescription: "",
          h1: [],
          statusCode: 200,
        },
      ],
      total: 1,
      source: "page",
    });
    const res = await call("tools/call", {
      name: "get_crawl_results",
      arguments: { crawlId: "c1" },
    });
    const { rows } = JSON.parse(toolText(res)) as { rows: Record<string, unknown>[] };
    expect(rows[0]).toEqual({ id: "p1", url: "https://example.com", statusCode: 200 });
  });

  it("list_result_tabs needs no arguments and names a real tab", async () => {
    const res = await call("tools/call", { name: "list_result_tabs" });
    const { tabs } = JSON.parse(toolText(res)) as { tabs: { tab: string; filters: string[] }[] };
    const titles = tabs.find((t) => t.tab === "titles");
    expect(titles?.filters).toContain("duplicate");
  });
});
