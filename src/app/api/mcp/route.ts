import { getUserIdFromApiKey } from "@/lib/apiAuth";
import { handleMcpMessage } from "@/lib/mcp/server";
import { RPC, rpcError, type JsonRpcResponse } from "@/lib/mcp/protocol";
import { PRODUCT_NAME } from "@/lib/brand";

/**
 * Model Context Protocol endpoint (Streamable HTTP transport).
 *
 *   POST /api/mcp    JSON-RPC in, JSON or SSE out
 *   GET  /api/mcp    405 — this server never opens a stream of its own
 *   DELETE /api/mcp  204 — stateless, so there is no session to end
 *
 * Auth is the same API key the REST API uses:
 *   Authorization: Bearer <key>   (or)   X-API-Key: <key>
 * Every request carries it; there is no session cookie and no server-side session state,
 * which is what lets this run behind any number of Next.js instances.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Authorization, Content-Type, Accept, X-API-Key, MCP-Protocol-Version, Mcp-Session-Id, Last-Event-ID",
  "Access-Control-Expose-Headers": "MCP-Protocol-Version, Mcp-Session-Id",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS, ...headers },
  });
}

/**
 * The transport lets the server answer with either JSON or a one-shot SSE stream. We
 * prefer JSON — simpler, and every client understands it — and only switch to SSE for a
 * client that asks for event-stream without also accepting JSON.
 */
function wantsSse(accept: string | null): boolean {
  if (!accept) return false;
  const a = accept.toLowerCase();
  return a.includes("text/event-stream") && !a.includes("application/json") && !a.includes("*/*");
}

function sse(payload: unknown) {
  return new Response(`event: message\ndata: ${JSON.stringify(payload)}\n\n`, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      ...CORS,
    },
  });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(req: Request) {
  const userId = await getUserIdFromApiKey(req);
  if (!userId) {
    return json(
      rpcError(null, RPC.invalidRequest, "Invalid or missing API key."),
      401,
      { "WWW-Authenticate": `Bearer realm="${PRODUCT_NAME} MCP"` },
    );
  }

  const raw = await req.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return json(rpcError(null, RPC.parseError, "Request body is not valid JSON."), 400);
  }

  // A batch (array) was part of the 2025-03-26 revision and dropped in 2025-06-18.
  // Accepting one either way costs nothing and keeps older clients working.
  const batch = Array.isArray(parsed);
  const messages: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
  if (batch && messages.length === 0) {
    return json(rpcError(null, RPC.invalidRequest, "Empty batch."), 400);
  }

  const replies: JsonRpcResponse[] = [];
  for (const msg of messages) {
    const reply = await handleMcpMessage(msg, userId);
    if (reply) replies.push(reply);
  }

  // Nothing but notifications: acknowledge receipt with no body, as the transport requires.
  if (replies.length === 0) return new Response(null, { status: 202, headers: CORS });

  const payload = batch ? replies : replies[0];
  return wantsSse(req.headers.get("accept")) ? sse(payload) : json(payload);
}

/** No server-initiated messages, so there is no stream to open here. */
export async function GET() {
  return json(
    { error: "This MCP endpoint does not offer a server-initiated stream. POST JSON-RPC instead." },
    405,
    { Allow: "POST, DELETE, OPTIONS" },
  );
}

/** Session teardown. Stateless server, so this is a no-op that always succeeds. */
export async function DELETE() {
  return new Response(null, { status: 204, headers: CORS });
}
