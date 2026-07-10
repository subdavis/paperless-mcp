import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";

/**
 * Tool annotations (readOnlyHint, and destructiveHint/openWorldHint for writes) — some MCP
 * clients (e.g. ChatGPT's developer mode connectors) treat missing/null hints as a validation
 * error and will refuse to list any tools at all, not just the offending one.
 */
export function readOnlyAnnotations(): ToolAnnotations {
  return { readOnlyHint: true };
}

/** `destructive` = the operation can irreversibly delete or overwrite data (not just add to it). */
export function writeAnnotations(destructive: boolean): ToolAnnotations {
  return { readOnlyHint: false, destructiveHint: destructive, openWorldHint: false };
}

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
