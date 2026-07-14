# MCP server go/no-go checklist (live demo)

Demonstration lab pre-flight. Complete before a live gate demo or cascade rehearsal.

## Pre-flight

- [ ] `.env` present at repo root with real-mode values set (`OKTA_CLIENT_MODE=real`, `OKTA_ORG_URL`, `OKTA_OAUTH_CLIENT_ID`, `OKTA_OAUTH_PRIVATE_KEY_PATH`, `OKTA_SCOPES`, `OKTA_DEMO_GROUP_ID`, `LAB3_DEMO_PREFIX`, `APPROVAL_SECRET`, `LAB3_AUDIT_HMAC_KEY`)
- [ ] `pnpm build` completes without errors
- [ ] No secrets in Claude Desktop MCP JSON — credentials stay in `.env` only (see [DEMO-RUNBOOK.md](./DEMO-RUNBOOK.md) section 1)

## Okta state assertions

- [ ] `OKTA_ORG_URL` points at the intended Integrator org
- [ ] OAuth service app (`lab3-mcp-identity`) is **active** in Okta Admin
- [ ] `OKTA_DEMO_GROUP_ID` matches the live `lab3-demo-group` id (update `.env` if `pnpm seed:demo` reports a different id)
- [ ] `LAB3_DEMO_PREFIX` is set (default `lab3-demo-`)

## Fixture verification

- [ ] `pnpm smoke:okta` returns **5/5 PASS**

## Real-mode launch

- [ ] Claude Desktop MCP config registers `scripts/start-desktop.mjs` with the absolute repo path (pins cwd for the shared `data/pending` store), **or** `pnpm start:real` running locally in a terminal
- [ ] Server appears in Claude's MCP tool list (`get_user`, `provision_user`, `grant_access`, `revoke_access`, `deactivate_user` — no approve/deny/resolve tools)

## Gate rehearsal

- [ ] One pending `revoke_access` created via Claude and **left unresolved** — membership unchanged while pending (gate holds)
- [ ] `pnpm approve` or `pnpm deny` run from a **separate terminal** with `APPROVAL_SECRET` (out-of-band credential; never an MCP tool)

## Post-demo

- [ ] Audit chain verifies ok (module-mode `verifyChain` with ADR-0003 `expected` assertion — see [BREAK-GLASS.md](./BREAK-GLASS.md) or [DEMO-RUNBOOK.md](./DEMO-RUNBOOK.md) section 7)
- [ ] Fixture restored: `pnpm seed:demo` then `pnpm smoke:okta` → **5/5 PASS**
