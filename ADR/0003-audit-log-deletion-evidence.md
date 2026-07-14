# ADR-0003: Verify-time assertion for audit-log deletion-evidence

**Status:** Accepted
**Date:** 2026-07-14
**Accepted:** 2026-07-14
**Deciders:** Jamie (approver), assistant (proposer)

## Context

The Lab 3 audit log is hash-chained and optionally HMAC-signed, so any edit, reorder, or deletion of a line that remains in the file breaks verification downstream. The offline audit-integrity pentest (L3-M5-02 Probe B, 2026-07-13) confirmed that property (7 HELD). But the same pass found a real boundary: `verifyChain` returns `{ ok: true }` on an absent file, on an empty file, and on any whole-line tail truncation (drop the last k complete lines and the remaining prefix still chains cleanly from genesis). The chain is tamper-evident against edits to the lines present, but not deletion-evident at the tail or whole-file level, because `verifyChain` carries no expected length, genesis anchor, or external head to contradict a shortened or missing file. This widened the AD-2 boundary from "empty/absent whole file" to "any suffix truncation."

Constraints: stdio demo; the HMAC key is held by the running process, so signing defends against an offline editor who lacks the key, not a compromised server. A co-located persisted anchor does not help on its own, because an attacker who can truncate the log can also edit a sidecar next to it; adding one would be a control that exists in name and not in mechanism, the failure class this lab documents (Assumption ledger, section D).

## Decision

`verifyChain` gains an optional verify-time assertion. Its options become `{ signingKey?, expected? }`, where `expected` carries the caller's independently-held ground truth: at minimum an entry `count`, and optionally the expected head `entryHash` (and `sig` when a signing key is in use). When `expected` is supplied, `verifyChain` fails closed if the file is absent or empty, if the number of chained entries does not exactly equal `expected.count`, or if the last entry's `entryHash`/`sig` does not equal the asserted head. Strict equality on `count` is deliberate: it catches deletion at the tail (fewer than expected) and any unexpected extra or injected trailing lines (more than expected), at the cost that the caller must assert the count captured at the same instant as the head. When `expected` is omitted, behavior is unchanged and backward compatible.

The verifier supplies the truth it already holds. The demo and cascade runbooks know how many operations they ran and can read the signed head; the paper's audit check knows the same. Scope is verify-time only: no new persisted artifact, no change to `appendAudit` or the on-disk JSONL format.

## Consequences

Positive: closes all three Probe B gap cases (absent, empty, whole-line tail truncation) with an actual mechanism; backward compatible because `expected` is optional; adds no co-located anchor that could itself be tampered; testable with zero credentials; strengthens the trustworthy-trail claim honestly. Strict count equality also flags injected trailing lines. Residual, stated plainly: the assertion is only as strong as the ground truth the caller brings; a standalone `verifyChain` call with no `expected` still returns ok on an empty or absent file by design, so any caller that cares about deletion-evidence must pass `expected`; and because the count check is strict, the caller must assert count and head as a matched snapshot (a stale count against a legitimately-grown log fails closed, the safe direction). This is verify-time deletion-evidence, not automatic caller-independent deletion-evidence; the latter needs an external anchor in a separate trust domain (count, head hash, and signature persisted offsite or to an append-only remote), which remains the production forward-work (KB ID-183; KB ID-081 / AgentField). The in-process HMAC-key limitation (a compromised server can forge) is unchanged and out of scope. Alternatives set aside: co-located sidecar anchor (Option B, rejected as convention-not-mechanism for a demo); periodic signed checkpoints (Option C, deferred, shares the in-process-key limitation); name-and-defer with no code (Option D, declined in favor of a real cheap mechanism, its honest-limit framing retained for the residual).

## References / Follow-On

- Probe B: docs/PENTEST-FINDINGS.md (Probe B section); tests/pentest-audit-integrity.test.ts; Lab3-M5-GoAppSec-Pentest-Plan.md.
- AD-2 (Assumption ledger, section A and the section E deletion-evidence open item); section D convention-vs-mechanism thesis; siblings AD-14, AD-8, AD-6.
- Builds on the AD-2 hash-chain (M1, c650547) and HMAC signing (M5b, c530dc95); relates to ADR-0001.
- Production forward-work: external chain-head anchor in a separate trust domain (KB ID-183, ID-081), toward Lab 4.
- Numbering: `ADR/0003-*` aligns with the cited Lab3-ADR series; the repo's physical `ADR/0002` (audit-event-fidelity) should be added at publish time so the on-disk sequence reads clean.
