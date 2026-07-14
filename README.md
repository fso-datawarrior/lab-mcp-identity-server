# lab-mcp-identity-server

MCP server that lets an AI assistant perform scoped Okta identity operations with an out-of-band human-approval gate on destructive actions.

**(Demonstration)**

## What this is

An MCP server that gives an AI scoped identity tools (lookup, provision, grant, revoke) against Okta, with an out-of-band human approval gate on destructive actions. This is a demonstration build for learning and lab use, not production software.

## Identity Lab Series

| Lab | Repo | Status |
| --- | --- | --- |
| Lab 1 Okta SCIM Lifecycle Server | [lab-okta-scim-server](https://github.com/fso-datawarrior/lab-okta-scim-server) | Complete |
| Lab 3 MCP Identity Server | this repo | In progress: M5 (pentest complete) |

## Run the full chain

An approved revoke in this lab removes an Okta group membership. That membership change cascades into Lab 1's SCIM deprovisioning path. See [lab-okta-scim-server](https://github.com/fso-datawarrior/lab-okta-scim-server) for the SCIM lifecycle side of the chain.

**Current milestone: M5 (governance hardening) — go-appsec pentest Probes A/B/C complete.**

## Live demo setup

This demonstration can run against your own Okta Integrator org. You need:

1. An Okta Integrator org with a scoped OAuth service app (private key JWT, with `kid` if your app has multiple keys).
2. A `.env` file at the repo root, copied from [`.env.example`](./.env.example). Set at minimum: `OKTA_ORG_URL`, `OKTA_OAUTH_CLIENT_ID`, `OKTA_OAUTH_PRIVATE_KEY_PATH`, `OKTA_SCOPES`, `OKTA_DEMO_GROUP_ID`, `LAB3_DEMO_PREFIX`, and `OKTA_CLIENT_MODE=real`.
3. Scopes broad enough to seed and verify the fixture (typically `okta.users.read`, `okta.users.manage`, and `okta.groups.manage`).

Create or refresh the demo objects (idempotent; safe to re-run):

```bash
pnpm seed:demo
```

Verify the live org matches the expected fixture:

```bash
pnpm smoke:okta
```

If `seed:demo` reports a group id that differs from `OKTA_DEMO_GROUP_ID`, update that variable in `.env` and re-run `pnpm smoke:okta`.

## Audit integrity

Hash-chained JSONL audit log with optional HMAC signing (`src/audit/log.ts`). Deletion-evidence is verify-time via the optional `expected` assertion on `verifyChain` (ADR-0003); an external chain-head anchor in a separate trust domain remains the production forward-path (KB ID-183, ID-081).

## asqav self-score

This is a conservative self-assessment of the demonstration lab against common AI-agent governance categories; the numbers reflect demo scope and known limitations, not a claim of enterprise readiness.

| Category | Score | Justification | Not covered |
| --- | ---: | --- | --- |
| Audit trail | 74 | Hash-chained JSONL (`src/audit/log.ts`), optional HMAC signing, verify-time deletion-evidence via `expected` (ADR-0003); pentest Probe B exercised tamper and deletion boundaries. | No external chain-head anchor in a separate trust domain (single-host); no real-time tamper alerting. |
| Policy enforcement | 71 | Tiered tool model (Tier 1 read, Tier 2 additive, Tier 3 destructive); protected-group guard (`src/policy/protectedGroups.ts`); demo group allowlist; non-empty justification on Tier 3 MCP inputs (`REQUIRED_JUSTIFICATION`). | Policy is code-enforced, not an externally configurable policy engine. |
| Revocation capability | 58 | Approved `revoke_access` removes Okta group membership (cascades to Lab 1 SCIM deprovision); service-app credential is rotatable/deactivatable in Okta Admin; `OKTA_CLIENT_MODE=mock` is an immediate kill-switch. | Least privilege — the service app holds Super Admin (maximal, not minimal, scope). |
| Human oversight | 70 | Out-of-band approval gate; `APPROVAL_SECRET` is a separate CLI (`pnpm approve` / `pnpm deny`), never an MCP tool; paired fingerprints on the approve audit line. | Single approver only — no multi-party/quorum, no mobile push-approval gate. |
| Error handling | 66 | TTL expiry → `expired` status + audit; client-mode mismatch refusal; `pnpm smoke:okta` eventual-consistency retries and bob self-heal; mode-mismatch guard tests. | No automated rollback of a partially completed cascade beyond re-seed (`pnpm seed:demo`). |

See also: [BREAK-GLASS.md](./docs/BREAK-GLASS.md), [MCP-SERVER-CHECKLIST.md](./docs/MCP-SERVER-CHECKLIST.md).

## License

MIT. See [LICENSE](./LICENSE).