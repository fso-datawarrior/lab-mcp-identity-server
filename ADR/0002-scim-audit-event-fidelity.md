# ADR-0002: SCIM audit events record full operation detail

**Status:** Accepted
**Date:** 2026-07-13
**Accepted:** 2026-07-13
**Deciders:** Jamie (approver), assistant (proposer)

## Context

The M4-c milestone ran the two-lab cascade live: an approved `revoke_access` in Lab 3 drove an Okta group removal, and Okta pushed a SCIM `PATCH active:false` into Lab 1 (about 2.9 seconds at M4-c; a later confirmatory run measured about 2.8 seconds), deprovisioning the user. The offline correlator `pnpm cascade:timeline` stitches both audit logs into one latency-annotated timeline as the milestone artifact.

It reported "no downstream deprovision found." Root cause: Lab 1's audit writer (`summarizeRequest` in `src/audit.ts`) recorded each SCIM PATCH operation as only `{ op }`, dropping `path` and `value`. Okta sends the deprovision as the object-form operation `{ "op": "replace", "value": { "active": false } }`, so the logged line became `{"op":"replace"}` and the deactivation was invisible in the audit. The Lab 3 correlator, which correctly requires `active:false` to confirm a deprovision, could never match it. This is tracked as AD-17 in the assumption ledger. The unit-test fixtures had encoded a richer operation than the runtime emitted, so the harness passed in development and failed closed against the real log.

This is the same shape as AD-2: an audit that cannot vouch for what the runtime actually did. A deprovision event that does not record what changed is not self-evidencing.

Repo-scope note: the root-cause fix lives in Lab 1 (`lab-okta-scim-server`, default branch master); this record sits in the Lab 3 repo because the cascade correlator is the consumer and the Lab 3 side carries a matching change. The physical file is added here so the on-disk ADR sequence (0001, 0002, 0003) reads clean, per the ADR-0003 References note.

## Decision

The audit event contract for SCIM write operations records the full operation detail. `summarizeRequest` maps each PATCH operation to `{ op, path, value }` (undefined keys drop out of serialization), so both the object-form (`value: { active: false }`) and the path-form (`path: "active", value: false`) deprovisions are captured faithfully. The standard: a lifecycle audit event must record enough of the operation to be self-evidencing, not merely that some operation occurred.

On the consumer side, the Lab 3 correlator keeps strict `active:false` matching as primary and adds a bounded, honest fallback only when an explicit `--scim-id` is asserted: a lossy replace PATCH on that id matches as `scim-id-replace-unconfirmed` with a printed caveat. Without an asserted id, a bare replace still fails closed, since it could be a re-activation. This tolerates historical lossy logs without inventing certainty the log does not carry.

## Consequences

Positive: future live cascades produce self-evidencing deprovision events; the correlator returns a confident `scim-id` match with no caveat; the AD-2 family of "the log cannot prove what happened" narrows by one instance; it strengthens the paper's audit-fidelity thesis. Negative and watch items: logging `value` could surface user attribute values on non-deprovision PATCHes (acceptable here, since no secrets flow through SCIM PATCH values because changePassword is unsupported; revisit if richer PATCH bodies appear); the `scim-id-replace-unconfirmed` path is a deliberate honesty compromise for old logs, not a preferred state. Follow-up: a single confirmatory live cascade to observe the rich-form line end to end.

## References / Follow-On

- Implementation: Lab 1 root-cause fix, `summarizeRequest` records `{ op, path, value }` (Lab 1 branch feat/audit-full-patch-op, f3006a0, merged to Lab 1 master 4144d81); Lab 3 correlator fallback (branch feat/m4-cascade-harness, 1ec9160, merged to main 6d673ee).
- Live evidence: the M4-c two-lab cascade run, ~2.9s deprovision latency (Lab3-M4c-Cascade-Timeline-Record-2026-07-13.md in the project workspace).
- Ledger: AD-17 (correlator false-negative), AD-2 (deletion-evidence family), section D convention-vs-mechanism thesis.
- Relates to ADR-0001 (approval channel) and ADR-0003 (audit-log deletion-evidence).
- Numbering: this physical `ADR/0002` was added during Phase P publish prep to complete the on-disk sequence; the decision was accepted 2026-07-13 at M4-c close.
