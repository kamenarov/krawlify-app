/**
 * Minimal JSON-RPC 2.0 / Model Context Protocol plumbing.
 *
 * Hand-rolled rather than pulled from @modelcontextprotocol/sdk: the surface we need is
 * one stateless HTTP endpoint speaking a handful of methods, and the SDK's transport
 * layer expects a long-lived Node server rather than a Next.js route handler.
 *
 * Transport is "Streamable HTTP": the client POSTs a JSON-RPC message and gets either a
 * JSON body or a one-shot SSE stream back. We never open a server-initiated stream, so
 * there is no session to keep — every request is authenticated and served on its own.
 */

/** Protocol revisions this server can speak, newest first. */
export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;
export const LATEST_PROTOCOL_VERSION = SUPPORTED_PROTOCOL_VERSIONS[0];

export type JsonRpcId = string | number | null;

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: unknown;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result?: unknown;
  error?: JsonRpcError;
}

/** Standard JSON-RPC codes. MCP adds no codes of its own for what we implement. */
export const RPC = {
  parseError: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internalError: -32603,
} as const;

export function rpcResult(id: JsonRpcId, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

export function rpcError(
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: data === undefined ? { code, message } : { code, message, data } };
}

/** A message with no `id` is a notification: acknowledged, never answered. */
export function isNotification(msg: JsonRpcRequest): boolean {
  return msg.id === undefined;
}

export function isJsonRpcRequest(v: unknown): v is JsonRpcRequest {
  if (!v || typeof v !== "object") return false;
  const m = v as Record<string, unknown>;
  return m.jsonrpc === "2.0" && typeof m.method === "string";
}

/**
 * Version negotiation: echo the client's version when we speak it, otherwise answer with
 * our latest and let the client decide whether to continue (per the MCP spec).
 */
export function negotiateProtocolVersion(requested: unknown): string {
  return typeof requested === "string" &&
    (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(requested)
    ? requested
    : LATEST_PROTOCOL_VERSION;
}
