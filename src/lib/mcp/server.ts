import { PRODUCT_DESCRIPTION, PRODUCT_NAME, PRODUCT_URL } from "@/lib/brand";
import { MCP_TOOLS, MCP_TOOLS_BY_NAME } from "./tools";
import {
  isJsonRpcRequest,
  isNotification,
  negotiateProtocolVersion,
  RPC,
  rpcError,
  rpcResult,
  type JsonRpcRequest,
  type JsonRpcResponse,
} from "./protocol";

export const MCP_SERVER_VERSION = "1.0.0";

/** Shown to the model once at connect time so it knows what this server is for. */
const INSTRUCTIONS = `${PRODUCT_NAME} crawls a website and reports its SEO health.

Typical flow: start_crawl with a seedUrl (keep maxUrls small unless a full audit was asked
for) → poll get_crawl until status is "done" → read findings with get_crawl_results.

get_crawl returns an issue summary — counts per category such as titles.duplicate or
images.altMissing. To see the pages behind a count, call get_crawl_results with the
matching tab and filter; list_result_tabs enumerates every valid pair. Results are
paginated, so check "hasMore" before concluding a list is complete.

A crawl runs in the background and a large site takes minutes. Nothing is lost by polling.`;

/**
 * Answer one JSON-RPC message. Returns null for notifications, which are acknowledged at
 * the transport layer rather than answered.
 *
 * `userId` is the owner of the API key that authenticated the request; every tool is
 * scoped to it, so this server has no ambient authority of its own.
 */
export async function handleMcpMessage(
  msg: unknown,
  userId: string,
): Promise<JsonRpcResponse | null> {
  if (!isJsonRpcRequest(msg)) {
    return rpcError(null, RPC.invalidRequest, "Not a valid JSON-RPC 2.0 request.");
  }
  const req = msg as JsonRpcRequest;
  const id = req.id ?? null;

  // Notifications carry no id and get no reply. `notifications/initialized` is the only
  // one a client of ours sends; the rest (cancellation, progress) are no-ops here since
  // every call is a single short round-trip.
  if (isNotification(req)) return null;

  try {
    switch (req.method) {
      case "initialize": {
        const params = (req.params ?? {}) as { protocolVersion?: unknown };
        return rpcResult(id, {
          protocolVersion: negotiateProtocolVersion(params.protocolVersion),
          capabilities: { tools: { listChanged: false } },
          serverInfo: {
            name: PRODUCT_NAME.toLowerCase(),
            title: `${PRODUCT_NAME} SEO Crawler`,
            version: MCP_SERVER_VERSION,
            websiteUrl: PRODUCT_URL,
            description: PRODUCT_DESCRIPTION,
          },
          instructions: INSTRUCTIONS,
        });
      }

      case "ping":
        return rpcResult(id, {});

      case "tools/list":
        return rpcResult(id, {
          tools: MCP_TOOLS.map((t) => ({
            name: t.name,
            title: t.title,
            description: t.description,
            inputSchema: t.inputSchema,
            ...(t.annotations ? { annotations: t.annotations } : {}),
          })),
        });

      case "tools/call":
        return await callTool(req, id, userId);

      // We advertise neither resources nor prompts, but some clients probe for them
      // anyway on connect. Empty lists keep their logs clean.
      case "resources/list":
        return rpcResult(id, { resources: [] });
      case "resources/templates/list":
        return rpcResult(id, { resourceTemplates: [] });
      case "prompts/list":
        return rpcResult(id, { prompts: [] });

      default:
        return rpcError(id, RPC.methodNotFound, `Unknown method: ${req.method}`);
    }
  } catch (err) {
    console.error(`[mcp] ${req.method} failed:`, err);
    return rpcError(id, RPC.internalError, err instanceof Error ? err.message : "Internal error");
  }
}

async function callTool(
  req: JsonRpcRequest,
  id: JsonRpcResponse["id"],
  userId: string,
): Promise<JsonRpcResponse> {
  const params = (req.params ?? {}) as { name?: unknown; arguments?: unknown };
  const name = typeof params.name === "string" ? params.name : "";
  const tool = MCP_TOOLS_BY_NAME.get(name);
  if (!tool) {
    return rpcError(id, RPC.invalidParams, `Unknown tool: ${name || "(none given)"}`);
  }

  const parsed = tool.args.safeParse(params.arguments ?? {});
  if (!parsed.success) {
    // Bad arguments are the model's mistake to fix, so report them as a tool error it can
    // read and retry from rather than a protocol error the client swallows.
    const detail = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    return rpcResult(id, textError(`Invalid arguments for ${name} — ${detail}`));
  }

  try {
    const data = await tool.run(userId, parsed.data as never);
    return rpcResult(id, {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    });
  } catch (err) {
    console.error(`[mcp] tool ${name} failed:`, err);
    return rpcResult(id, textError(err instanceof Error ? err.message : `${name} failed.`));
  }
}

/** A tool-level failure: a normal result carrying isError, so the model sees the reason. */
function textError(message: string) {
  return { content: [{ type: "text", text: message }], isError: true };
}
