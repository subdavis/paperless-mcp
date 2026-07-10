import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { PaperlessAPI } from "./api/PaperlessAPI";
import { registerCorrespondentTools } from "./tools/correspondents";
import { registerDocumentTools } from "./tools/documents";
import { registerDocumentTypeTools } from "./tools/documentTypes";
import { registerTagTools } from "./tools/tags";

export class PaperlessMCP extends McpAgent<Env> {
  server = new McpServer({ name: "paperless-ngx", version: "1.0.0" });

  async init() {
    const api = new PaperlessAPI(this.env.PAPERLESS_URL, this.env.PAPERLESS_TOKEN);
    registerDocumentTools(this.server, api);
    registerTagTools(this.server, api);
    registerCorrespondentTools(this.server, api);
    registerDocumentTypeTools(this.server, api);
  }
}

/**
 * Constant-time string comparison so a wrong bearer token can't be brute-forced
 * via response-timing differences. Both inputs are hashed to a fixed length via
 * a byte-by-byte comparison over the longer of the two (padded), so early exits
 * never happen based on where the mismatch occurs.
 */
function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  const length = Math.max(aBytes.length, bBytes.length, 1);
  let mismatch = aBytes.length === bBytes.length ? 0 : 1;
  for (let i = 0; i < length; i++) {
    const x = i < aBytes.length ? aBytes[i] : 0;
    const y = i < bBytes.length ? bBytes[i] : 0;
    mismatch |= x ^ y;
  }
  return mismatch === 0;
}

function isAuthorized(request: Request, env: Env): boolean {
  const auth = request.headers.get("Authorization");
  if (!auth || !env.MCP_AUTH_TOKEN) return false;
  return timingSafeEqual(auth, `Bearer ${env.MCP_AUTH_TOKEN}`);
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (!isAuthorized(request, env)) {
      return new Response("Unauthorized", { status: 401 });
    }
    return PaperlessMCP.serve("/mcp").fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
