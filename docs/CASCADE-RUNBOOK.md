# M4 cascade runbook (Lab 3 to Lab 1)

Demonstration only. Correlates an approved Lab 3 group revoke with a downstream Lab 1 SCIM deprovision. This harness is read-only against Okta (preflight) and offline for log correlation (timeline). It does not run the live cascade.

Companion: [DEMO-RUNBOOK.md](./DEMO-RUNBOOK.md) (live gate demo).

## Prerequisites

1. **SCIM app wiring** in Okta Admin:
   - Assign `lab3-demo-group` to the Lab 1 SCIM app.
   - Enable **Create** and **Deactivate** provisioning actions.
   - Set the SCIM base URL to the current Lab 1 tunnel endpoint.
2. **Cascade target user** must be **ACTIVE** in Okta and already provisioned downstream via SCIM. STAGED users may not appear in Lab 1.
3. **Joiner-before-leaver ordering:** provision the user into the SCIM app (joiner) before testing revoke (leaver). The cascade only fires when group membership removal triggers Okta to deprovision the app assignment.
4. **Lab 3** `.env` complete with `OKTA_CLIENT_MODE=real` for preflight (same service app credentials as the live demo).
5. **Tunnel rotation gotcha:** if the Lab 1 tunnel URL changes, update the SCIM base URL in Okta before running a cascade rehearsal.
6. **Audit logs** after a live cascade run:
   - Lab 3: `data/audit.jsonl` (this repo)
   - Lab 1: `logs/audit.jsonl` in [lab-okta-scim-server](https://github.com/fso-datawarrior/lab-okta-scim-server)

## Step 1: Read-only preflight

Confirms demo group membership and SCIM app wiring (or prints a manual checklist if `okta.apps.read` is not granted):

```bash
pnpm build
pnpm cascade:preflight
```

Expected: demo group name and members printed; app assignments listed or manual checklist shown; no writes performed.

## Step 2: Offline timeline correlation

After a live cascade (not run by this harness), correlate the two audit logs.

`--okta-id` is recommended. When omitted, the correlator falls back to sole-candidate only when exactly one approved `revoke_access` line exists in the Lab 3 log.

`--scim-id` overrides Lab 1 deprovision matching when multiple PATCH lines exist or when the joiner-leaver run has no PUT (POST create only).

```bash
pnpm cascade:timeline -- \
  --lab3 data/audit.jsonl \
  --lab1 /path/to/lab-okta-scim-server/logs/audit.jsonl \
  --user cascade-active@example.com \
  --okta-id 00uYourOktaUserId
```

With explicit SCIM id:

```bash
pnpm cascade:timeline -- \
  --lab3 data/audit.jsonl \
  --lab1 /path/to/lab-okta-scim-server/logs/audit.jsonl \
  --user cascade-active@example.com \
  --okta-id 00uYourOktaUserId \
  --scim-id scimYourUserId
```

JSON output:

```bash
pnpm cascade:timeline -- \
  --lab3 data/audit.jsonl \
  --lab1 ../lab-okta-scim-server/logs/audit.jsonl \
  --user cascade-active@example.com \
  --okta-id 00uYourOktaUserId \
  --json
```

Expected: one merged timestamp-ordered timeline, `matchMethod` in output, and cascade latency in seconds.

Fail closed if either chain endpoint is missing:

```
no downstream deprovision found for <user> - is the SCIM app wired and the user ACTIVE?
```

Ambiguous Lab 1 logs (multiple `active:false` PATCHes with no scim-id or userName match) fail closed without guessing.

## Fixture dry run (no credentials)

Joiner-leaver (POST create, no PUT):

```bash
pnpm cascade:timeline -- \
  --lab3 tests/fixtures/lab3-cascade-audit.jsonl \
  --lab1 tests/fixtures/lab1-joiner-leaver-audit.jsonl \
  --user cascade-active@example.com \
  --okta-id 00uCascadeUser
```

Username match via PUT map:

```bash
pnpm cascade:timeline -- \
  --lab3 tests/fixtures/lab3-cascade-audit.jsonl \
  --lab1 tests/fixtures/lab1-cascade-audit.jsonl \
  --user cascade-active@example.com \
  --okta-id 00uCascadeUser
```

## Gotchas

| Gotcha | Mitigation |
| --- | --- |
| STAGED vs ACTIVE | Use an ACTIVE cascade user; preflight warns on STAGED members |
| Tunnel URL rotated | Re-point SCIM base URL before cascade rehearsal |
| `okta.apps.read` missing | Preflight degrades to manual console checklist |
| Okta membership eventual consistency | See DEMO-RUNBOOK section 8; smoke test retries |
| Joiner-leaver without PUT | Timeline uses sole-candidate fallback; stderr notes the match method |

## What this harness does NOT do

- Does not call revoke, approve, or any destructive Okta API
- Does not run the live cascade end to end
- Does not modify MCP tool logic
