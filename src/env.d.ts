export {};

// `wrangler types` only picks up bindings declared in wrangler.jsonc (the
// PaperlessMCP durable object). Secrets set via `wrangler secret put` /
// .dev.vars are not declared there, so we extend the generated `Env`
// interface here to keep them type-checked.
declare global {
  interface Env {
    /** Base URL of the paperless-ngx instance, e.g. https://paperless.example.com */
    PAPERLESS_URL: string;
    /** paperless-ngx API token (Django REST "Token" auth). */
    PAPERLESS_TOKEN: string;
    /** Shared secret required as `Authorization: Bearer <token>` on inbound requests. */
    MCP_AUTH_TOKEN: string;
  }
}
