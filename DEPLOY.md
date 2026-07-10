# Deploy Guide: paperless-mcp on Cloudflare Workers

This walks through everything from zero to "paperless-ngx tools working inside claude.ai" —
including the one-time Cloudflare Zero Trust setup, if you haven't done that before. If you
already have a Zero Trust org and an identity provider, skip to
[Part 3](#part-3-deploy-the-worker).

Total time: ~20–30 minutes if starting from scratch, ~10 minutes if Zero Trust is already set up.

---

## Before you start, check off these prerequisites

- [ ] A **Cloudflare account** (free tier is fine). [Sign up](https://dash.cloudflare.com/sign-up) if needed.
- [ ] A **paperless-ngx instance reachable over public HTTPS** — a real hostname, or fronted by a
      [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/).
      Workers run on Cloudflare's edge network, not your LAN — if your instance is only reachable
      at `http://192.168.x.x:8000` or `http://localhost:8000`, none of this will work until you
      either put it behind a Tunnel or give it a public hostname.
- [ ] A **paperless-ngx API token**: log into paperless-ngx → click your username (top right) →
      **My Profile** → scroll to **API Token** → click the circular-arrow icon to generate one →
      copy it. You won't be able to see it again after leaving the page.
- [ ] **Node.js** (v18+) and npm installed locally.
- [ ] This repo, on your machine, at `paperless-mcp/`.

---

## Part 1: Cloudflare CLI login

```sh
cd paperless-mcp
npm install
npx wrangler login
```

This opens a browser tab asking you to authorize Wrangler against your Cloudflare account. Approve
it, then return to the terminal — it should print `Successfully logged in.`

If you manage multiple Cloudflare accounts, confirm the right one is active:

```sh
npx wrangler whoami
```

---

## Part 2: One-time Zero Trust setup

**Skip this whole part if you already have a Zero Trust organization with an identity provider
configured.** You only need this once per Cloudflare account, not per Worker.

### 2.1 Create a Zero Trust organization

1. Go to the [Cloudflare dashboard](https://dash.cloudflare.com/) → **Zero Trust** in the left
   sidebar.
2. If prompted, choose a **team name** (e.g. `yourname`) — this becomes
   `https://yourname.cloudflareaccess.com`, your **team domain**. Pick something you're fine
   living with; it's shown to you (and anyone you invite) during login.
3. Select the **Free** plan unless you know you need otherwise (50 users free, plenty for personal
   use).

### 2.2 Configure an identity provider

You need at least one way for Cloudflare Access to authenticate you when you log into the portal.
The fastest option with zero external setup:

1. **Zero Trust dashboard** → **Settings** → **Authentication**.
2. Under **Login methods**, add **One-time PIN**. This emails you a 6-digit code at login time —
   no external IdP account needed.
3. (Optional, if you'd rather use Google/GitHub/Okta/etc.) Add that provider instead or in
   addition — see [Identity providers docs](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/).

That's the whole one-time setup. Everything below is per-Worker / per-portal.

---

## Part 3: Deploy the Worker

### 3.1 Deploy

```sh
npx wrangler deploy
```

Expected output ends with something like:

```
Uploaded paperless-mcp (x.xx sec)
Deployed paperless-mcp triggers (x.xx sec)
  https://paperless-mcp.<your-subdomain>.workers.dev
Current Version ID: ...
```

**Copy that URL** — you'll need it in Part 4 and Part 5. If this is your very first Worker
deployment on this account, Cloudflare will also ask you to confirm a `workers.dev` subdomain the
first time; accept the default unless you have a reason not to.

### 3.2 Set the three secrets

Each command prompts you to paste a value (input is hidden):

```sh
npx wrangler secret put PAPERLESS_URL
```
> Paste your paperless-ngx base URL, e.g. `https://paperless.example.com` — **no trailing slash**.

```sh
npx wrangler secret put PAPERLESS_TOKEN
```
> Paste the API token you generated in the prerequisites.

```sh
npx wrangler secret put MCP_AUTH_TOKEN
```
> Paste a long random secret you generate yourself — this is **not** from paperless-ngx, it's a
> password this Worker will require from anyone connecting to it. Generate one with:
> ```sh
> openssl rand -hex 32
> ```
> Save this value somewhere (password manager) — you'll paste it again in Part 5.

Verify all three are set:

```sh
npx wrangler secret list
```

Expected output: a JSON array listing `PAPERLESS_URL`, `PAPERLESS_TOKEN`, `MCP_AUTH_TOKEN` (values
are never shown, just names).

### 3.3 Smoke-test the deployed Worker directly

Before wiring up the portal, confirm the Worker itself responds correctly. Replace
`<your-subdomain>` and `<MCP_AUTH_TOKEN>` below:

```sh
# No auth header -> expect 401
curl -s -o /dev/null -w "%{http_code}\n" \
  https://paperless-mcp.<your-subdomain>.workers.dev/mcp \
  -X POST -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
# -> 401

# With auth header -> expect 200 and an mcp-session-id response header
curl -s -D - -o /dev/null \
  https://paperless-mcp.<your-subdomain>.workers.dev/mcp \
  -X POST -H "Authorization: Bearer <MCP_AUTH_TOKEN>" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"smoke-test","version":"0.0.1"}}}'
# -> HTTP/1.1 200 OK, with an `mcp-session-id: ...` header
```

If the second call doesn't return 200, check `npx wrangler tail` in another terminal while you
retry — it streams live logs from the deployed Worker and will show any thrown error.

For a friendlier check, use [MCP Inspector](https://github.com/modelcontextprotocol/inspector):

```sh
npx @modelcontextprotocol/inspector
```
- Transport: **Streamable HTTP**
- URL: `https://paperless-mcp.<your-subdomain>.workers.dev/mcp`
- Header: `Authorization: Bearer <MCP_AUTH_TOKEN>`
- Click **Connect**, then **List Tools** — you should see all 16 tools.

---

## Part 4: Create an MCP server portal

**Important — two separate Access policies are required, not one.** The portal and each MCP
server registered inside it are two distinct Access-protected objects:

- The **portal** has a policy controlling who can log in to the portal URL at all.
- Each **server** (e.g. `paperless-ngx`) has its *own* policy controlling whether it shows up for
  a given logged-in user.

Passing the portal's login screen only proves the portal-level policy passed — it says nothing
about whether any server will actually appear for you. Missing the server-level policy is the
single most common setup mistake here (see [Troubleshooting](#troubleshooting) below), so don't
skip step 4.2.

1. **Zero Trust dashboard** → **Access controls** (left sidebar) → **AI controls** → **MCP server
   portals**.
2. Click **Create a portal** (or reuse an existing one if you already have one for other MCP
   servers). Give it a name, e.g. `mcp-portal`.
3. After creation, the portal has its own hostname on a domain you control in Cloudflare, e.g.
   `https://mcp.yourdomain.com` — this is the URL you'll give to claude.ai later, **not** the
   Worker URL.
   - If you don't have a domain on Cloudflare yet, you'll need to add one (**Websites** → **Add a
     site**) before you can create a portal — portals need a hostname to live on.
4. **Add a portal-level Access policy**: under the portal's own **Access policies** section, add a
   policy defining who can connect to the portal URL at all. Simplest: **Include** → **Emails** →
   your email address. Without this, the portal won't prompt for authentication at all.

### 4.1 Add your Worker as an upstream server

1. Inside the portal, click **Add an MCP server**.
2. Fill in:
   - **Name**: `paperless-ngx`
   - **HTTP URL**: `https://paperless-mcp.<your-subdomain>.workers.dev/mcp`
     (the `/mcp` suffix tells the portal to use Streamable HTTP directly, skipping transport
     auto-detection)
   - **Authentication method**: choose **Custom Headers**
     - Header name: `Authorization`
     - Header value: `Bearer <MCP_AUTH_TOKEN>` (the exact secret from step 3.2 — include the word
       `Bearer` and the space)
3. Save. This registers `paperless-ngx` as its own Access application — it will also show up
   under **AI controls → MCP servers** as a standalone entry, separate from the portal.

### 4.2 Add a policy to the server itself (separate from the portal's policy)

This is the step that's easy to miss, because the UI lets you add the server without ever
requiring one.

1. Go to **AI controls → MCP servers** tab (not the portal), find the `paperless-ngx` entry you
   just created, and open it (**Edit**).
2. Under its **Access policies** section, add a policy — same as the portal's, the simplest is
   **Include** → **Emails** → your email address (must match the identity you'll log in with).
3. Save.

Without this, the server exists and syncs fine, but no user will ever see it through any portal —
which is precisely the `No allowed servers available` error.

### 4.3 Confirm sync status

Back on the portal's server list, the new entry should show a sync status. Statuses:
- **Waiting** → still syncing, wait a few seconds and refresh.
- **Ready** → success! The portal reached your Worker and fetched its tool list.
- **Error** → click in for details (message, HTTP status, MCP error code). Common causes:
  - Wrong header value (typo in the token, or forgot the `Bearer ` prefix)
  - Worker URL missing `/mcp`
  - Worker not actually deployed / secrets not set (recheck Part 3)

Don't move on to Part 5 until this shows **Ready** *and* you've completed step 4.2.

---

## Part 5: Connect claude.ai to the portal

1. Go to [claude.ai](https://claude.ai) → **Settings** → **Connectors**.
2. Click **Add custom connector**.
3. Paste the **portal's URL** (from step 4, e.g. `https://mcp.yourdomain.com`) — again, not the
   `.workers.dev` Worker URL.
4. Claude will redirect you to log in via Cloudflare Access. Complete the login using whichever
   identity provider you set up in Part 2 (e.g. enter the One-time PIN emailed to you).
5. On success, the connector should list the paperless-ngx tools (16 of them, or a single
   collapsed "Code Mode" tool depending on the portal's mode — see below).
6. Test it: start a new chat and ask Claude something like *"list my paperless tags"* or *"search
   my documents for invoices from last year."*

### Code Mode vs. individual tools

By default, MCP server portals run in **Code Mode**, which collapses all upstream tools behind a
single executable interface to save context — Claude writes small scripts against your tools
rather than calling each one directly. This is usually fine and often better for larger tool sets.
If you want to see/toggle this, it's a per-portal setting in the Zero Trust dashboard.

---

## Troubleshooting

### "No allowed servers available, check your Zero Trust Policies"

You'll land here (at the portal's `/servers-callback` URL) right after successfully logging in
via Cloudflare Access — which is exactly what makes this confusing, since the login itself
worked. This is Cloudflare's own documented behavior, with two causes, in order of likelihood:

1. **The server is missing its own Access policy.** The portal and the server are two separate
   Access-protected objects, each needing its own policy (see [Part 4.2](#42-add-a-policy-to-the-server-itself-separate-from-the-portals-policy)).
   Go to **AI controls → MCP servers**, open `paperless-ngx`, and confirm it has a policy attached
   — *not just the portal*. Also confirm the email/identity in that policy exactly matches the
   account you authenticated with (typos here fail silently).
2. **The server's status isn't `Ready`.** Same screen — if it shows `Error` or `Sync Required`,
   the server is excluded from every portal regardless of policy. Re-check the Custom Header value
   (Part 4.1) and re-save to force a resync.

Fix whichever applies, then retry the claude.ai connector flow from Part 5 — you don't need to
redo the login, just reconnect the connector.

### Other issues

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `curl` to the Worker returns `401` even with the header | Wrong `MCP_AUTH_TOKEN`, or forgot `Bearer ` prefix | Re-check the exact header value; regenerate with `wrangler secret put MCP_AUTH_TOKEN` if unsure what was set |
| Worker returns `200` but tool calls fail with "Paperless-ngx request failed: ..." | `PAPERLESS_URL` or `PAPERLESS_TOKEN` wrong, or paperless-ngx unreachable from the internet | Test `curl https://your-paperless-url/api/` from a machine outside your LAN; re-set secrets if needed |
| Portal shows **Error** on the server sync | Header/URL misconfigured, or Worker not deployed | Recheck 4.1; use `npx wrangler tail` to watch for live request errors while the portal retries |
| Portal shows **Sync Required** after working fine for a while | Admin credential/token expired or was rotated | Re-open the server entry in the portal and re-enter the Custom Header value |
| claude.ai connector login loops or fails | Portal-level Access policy doesn't include your identity, or IdP misconfigured | Check the *portal's* Access policy includes your email/group; verify login method in Zero Trust → Settings → Authentication |
| Changes to code don't show up after redeploying | Forgot to redeploy, or browser/portal cache | Re-run `npx wrangler deploy`; portal tool sync runs on its own ~2 hour cycle but reconnecting a client usually refreshes immediately |

---

## Redeploying after code changes

```sh
npm run type-check   # tsc --noEmit — catch errors before deploying
npx wrangler deploy
```

Secrets persist across deploys — you only need to re-run `wrangler secret put` if a value
actually changes (e.g. you rotate `MCP_AUTH_TOKEN` or your paperless-ngx API token). If you rotate
`MCP_AUTH_TOKEN`, remember to also update the Custom Header value in the portal's server config
(step 4.1), or the portal will start failing sync.
