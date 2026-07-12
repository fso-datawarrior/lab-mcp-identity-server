# Live end-to-end gate demo runbook

Demonstration only. Run against your own Okta Integrator org with the lab3 demo fixture.

## 0. Prerequisites

1. Copy [`.env.example`](../.env.example) to `.env` and fill in all values, including:
   - `OKTA_CLIENT_MODE=real` (for the live demo; Claude Desktop also sets this in its `env` block)
   - `APPROVAL_SECRET` (out-of-band approver credential; never an MCP tool)
   - `LAB3_AUDIT_HMAC_KEY` (audit HMAC signing key for evidence capture)
   - Okta service app fields (`OKTA_ORG_URL`, `OKTA_OAUTH_CLIENT_ID`, `OKTA_OAUTH_PRIVATE_KEY_PATH`, scopes, `OKTA_DEMO_GROUP_ID`, `LAB3_DEMO_PREFIX`)
2. Build the server:

   ```bash
   pnpm build
   ```

3. Verify fixture state (all steps should PASS):

   ```bash
   pnpm smoke:okta
   ```

4. Optional: set `LAB3_PRINCIPAL` in `.env` if you want a custom audit principal (default: `claude-desktop`).

## 1. Claude Desktop registration

Paste into your Claude Desktop MCP config. Replace `<ABSOLUTE_REPO_PATH>` with the full path to this repo. **No secrets** go in this JSON; they stay in `.env`.

```json
{
  "mcpServers": {
    "lab-mcp-identity": {
      "command": "node",
      "args": [
        "--env-file=<ABSOLUTE_REPO_PATH>/.env",
        "<ABSOLUTE_REPO_PATH>/dist/index.js"
      ],
      "env": {
        "OKTA_CLIENT_MODE": "real"
      }
    }
  }
}
```

Restart Claude Desktop after saving. Confirm the server connects (check Claude MCP tools list).

Local convenience (without editing Desktop config):

```bash
pnpm start:real
```

## 2. Beat 1 (read)

**Prompt to Claude:**

> Use the lab-mcp-identity server to look up the user `lab3-demo-alice@example.com` with `get_user`. Report id, status, and group memberships.

**Expected:** STAGED user returned; sanitized profile; audit line with `decision: "executed"` or lookup outcome.

**Screenshot:** Claude tool call + result showing alice STAGED and group list.

## 3. Beat 2 (the gate)

**Prompt to Claude:**

> Revoke `lab3-demo-alice@example.com`'s access to the group `lab3-demo-group`. Justification: "end-to-end demo revoke beat".

**Expected:**

- Tool returns `{ "status": "pending", "requestId": "<uuid>" }`
- Alice **still a member** of `lab3-demo-group` (gate did not execute)
- Audit line with `decision: "pending"`

**Verify membership** (separate terminal):

```bash
pnpm smoke:okta
```

Step 2 should still show alice in the demo group. Or inspect Okta directly.

**Screenshot:** Pending response with `requestId`; proof alice still in group.

## 4. Beat 3 (out-of-band approve)

Copy `requestId` from Beat 2. In a **separate terminal** (human approver, not Claude):

```bash
pnpm approve <requestId>
```

**Expected:**

- Exit code 0; `{ "resolved": true, "status": "approved" }`
- Live Okta: alice **removed** from `lab3-demo-group`
- New audit line: `decision: "approved"` with **paired fingerprints**:
  - `actorFingerprint`: AI actor (derived from `LAB3_PRINCIPAL`)
  - `approverCredential`: 12-char hash of `APPROVAL_SECRET` (not the raw secret)

**Verify:**

```bash
pnpm smoke:okta
```

Step 2 should FAIL (alice no longer in demo group) until Beat 6 restores her.

**Screenshot:** Terminal approve output; smoke step 2 failure or Okta UI showing removal.

## 5. Beat 4 (the denial)

**Prompt to Claude:**

> Request deactivation of user `lab3-demo-alice@example.com`. Justification: "end-to-end demo denial beat".

**Expected:** Pending `requestId` returned; alice remains **STAGED**.

In a separate terminal:

```bash
pnpm deny <requestId>
```

**Expected:**

- Exit code 0; `{ "resolved": true, "status": "denied" }`
- Alice still **STAGED**, not deactivated
- Audit line: `decision: "denied"`

**Screenshot:** Deny terminal output; `get_user` still shows STAGED.

## 6. Beat 5 (restore fixture)

**Prompt to Claude:**

> Grant `lab3-demo-alice@example.com` access to the group `lab3-demo-group`. Justification: "restore demo fixture after gate demo".

**Expected:**

- Tier 2 grant executes immediately (`granted: true`)
- Alice is a member of `lab3-demo-group` again

**Verify:**

```bash
pnpm smoke:okta
```

All 5 steps should PASS.

**Screenshot:** Grant result + smoke 5/5 PASS.

## 7. Evidence capture

1. Copy the audit log:

   ```bash
   cp data/audit.jsonl demo-audit-$(date +%Y%m%d).jsonl
   ```

2. Verify the hash chain **with HMAC signing** (requires `LAB3_AUDIT_HMAC_KEY` in env):

   ```bash
   node --env-file=.env -e "
   import { verifyChain } from './dist/audit/log.js';
   const key = process.env.LAB3_AUDIT_HMAC_KEY;
   const r = await verifyChain('data/audit.jsonl', { signingKey: key });
   console.log(JSON.stringify(r));
   "
   ```

   **Expected:** `{ "ok": true }`

3. **Screenshots to capture:**
   - Beat 1: Claude `get_user` result
   - Beat 2: Pending revoke + proof of continued membership
   - Beat 3: `pnpm approve` output + membership removed
   - Beat 4: `pnpm deny` output + alice still STAGED
   - Beat 5: Grant restore + `pnpm smoke:okta` 5/5 PASS
   - Evidence: `verifyChain` ok result (terminal) + redacted audit excerpt showing paired fingerprints on the approve line

## 8. Reset notes

**TTL expiry:** Pending requests expire after the configured TTL (default 300 seconds). An expired request returns `status: "expired"` on approve/deny attempt; audit records `decision: "expired"`. Re-run the Claude prompt to create a fresh `requestId`.

**Clear pending between rehearsals:** Demo pending files only (safe to delete):

```bash
rm -f data/pending/*.json
```

Do not truncate `data/audit.jsonl` if you need evidence; copy it first. The audit log is append-only by design.

**Restore fixture if interrupted:** If approve ran but grant restore did not, re-run Beat 6 or `pnpm seed:demo` (idempotent) then `pnpm smoke:okta`.
