# BREAK-GLASS (live demo recovery)

> Demonstration lab. These are recovery procedures for a controlled demo, not a production incident-response runbook.

## Server in a bad state

1. **Stop the server:** terminate the running MCP process (Ctrl+C in the terminal, or quit/restart Claude Desktop if the server is launched from Desktop).
2. **Confirm mode:** ensure `.env` has `OKTA_CLIENT_MODE=real` for a live demo (the Desktop launcher also sets this).
3. **Relaunch:**
   - **Local:** `pnpm build` then `pnpm start:real`
   - **Claude Desktop:** restart Desktop with `scripts/start-desktop.mjs` registered in the MCP config (pins cwd to the repo root for the shared pending store). See [DEMO-RUNBOOK.md](./DEMO-RUNBOOK.md) section 1.

## Revoke or rotate the service-app credential

The live demo uses an OAuth private-key-JWT **service app** (`lab3-mcp-identity`) in the Okta admin console.

- **Rotate:** issue a new key in the service app, update `OKTA_OAUTH_PRIVATE_KEY_PATH` (and `OKTA_OAUTH_KEY_ID` if applicable) in `.env`, restart the server.
- **Deactivate:** deactivate the service app in Okta Admin to invalidate the credential immediately.
- **Fast kill-switch:** set `OKTA_CLIENT_MODE=mock` in `.env` and restart, all live Okta API calls are disabled immediately (mock in-memory client only). The desktop launcher now honors `OKTA_CLIENT_MODE` from `.env` (previously it hard-coded `"real"`), so setting mock in `.env` and restarting engages the kill-switch on the desktop path as documented.

Required env vars for real mode: `OKTA_ORG_URL`, `OKTA_OAUTH_CLIENT_ID`, `OKTA_OAUTH_PRIVATE_KEY_PATH`, `OKTA_SCOPES`, `OKTA_DEMO_GROUP_ID`, `LAB3_DEMO_PREFIX`, `OKTA_CLIENT_MODE=real`.

## Clear stale pending approvals

Demo pending files only (safe to delete):

```bash
rm -f data/pending/*.json
```

Never truncate `data/audit.jsonl`, it is append-only. Copy it first if you need evidence:

```bash
cp data/audit.jsonl demo-audit-$(date +%Y%m%d).jsonl
```

## Verify the audit chain after any incident

Requires `LAB3_AUDIT_HMAC_KEY` in `.env`. Run after `pnpm build`:

```bash
node --env-file=.env --input-type=module -e "const { readFile } = await import('node:fs/promises'); const { verifyChain } = await import('./dist/audit/log.js'); const path = 'data/audit.jsonl'; const key = process.env.LAB3_AUDIT_HMAC_KEY; const content = await readFile(path, 'utf8'); const lines = content.split('\n').filter((l) => l.length > 0); const last = JSON.parse(lines[lines.length - 1]); const r = await verifyChain(path, { signingKey: key, expected: { count: lines.length, headEntryHash: last.entryHash, headSig: last.sig } }); console.log(JSON.stringify(r));"
```

**Expected:** `{ "ok": true }`

## Restore the demo fixture

Idempotent re-seed and verification:

```bash
pnpm seed:demo
pnpm smoke:okta
```

Expect **5/5 PASS**.
