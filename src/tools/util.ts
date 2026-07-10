import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/** Wrap a plain JS value (typically a parsed JSON API response) as a text tool result. */
export function jsonResult(value: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  };
}

/** Wrap a caught error as an MCP tool error result instead of throwing across the transport. */
export function errorResult(error: unknown): CallToolResult {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}
