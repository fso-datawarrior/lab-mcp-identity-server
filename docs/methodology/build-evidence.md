# Build Evidence

*What the build actually proved, milestone by milestone, with test counts and commit hashes. Companion to the [whitepaper](../whitepaper/even-a-compromised-model.md) and the [assumption ledger](./assumption-ledger.md). The ledger records what was believed and why it changed; this record shows what the code demonstrated.*

The whole test suite runs with **zero credentials** in mock mode, so any of the counts below are reproducible from a clean clone with `pnpm test`.

## The test spine (monotonic, one increment per validated task)

```
7 → 11 → 16 → 24 → 31 → 37 → 41 → 48 → 50 → 51 → 54 → 57 → 66 → 74 → 86 → 96 → 102 → 108 → 115
```

Each step is a task with explicit acceptance criteria that passed on first validation, cross-checked against what was actually on disk rather than against the implementer's own summary. Through the whole build there were zero failed validations, zero rework loops, and zero reverts on an executed task. The final step (108 → 115) is the concurrency-hardening suite (serialized `appendAudit`, atomic approve claim, and related regression tests).

## What each milestone proved

- **Audit module (`c650547`), 6 tests.** Append-only, hash-chained JSONL with independent verification. Editing a middle entry trips an entry-hash mismatch at the exact line; deleting a line trips a previous-hash mismatch on the following entry.
- **Server + `get_user` + input trust boundary (`1177510`), 11 tests.** A running MCP stdio server exposes `get_user` via a mock client, with one hash-chained audit line per call. A hostile fixture's zero-width and control characters are stripped and the chain stays valid.
- **`provision_user`, `grant_access`, protected-group guard (`d19cc95`), 16 tests.** A grant into a normal group is idempotent Tier 2; a grant into a protected group is Tier 3 and fails closed with no membership change. A grant is additive yet treated as destructive because the target is sensitive (AD-4).
- **Durable pending store + resolution engine (`f713c37`), 24 tests.** Single-use, TTL-bounded per-file pending store; the resolver fails closed on not-found, already-resolved, expired, wrong-credential, deny, and drift, then executes at most once.
- **Out-of-band approval gate + CLI + exposure boundary (`3a59f79`), 31 tests.** Tier 3 tools only create pending requests; a separate CLI resolves with a credential the model never holds; no MCP tool resolves. A test asserts the registered tool set is exactly the five operational tools, with no approve/deny/resolve/confirm. On approval, the audit line records the AI actor fingerprint and a distinct approver fingerprint; the raw secret is never written.
- **Recursive redaction + exactly-once marker (`0ad698d7`), 37 tests.** Redaction recurses into nested objects and arrays; the pending store persists an "approving" status before the executor, making execution at-most-once across a crash.
- **HMAC-signed audit entries (`c530dc9`), 41 tests.** The headline test: an attacker tampers a middle entry and recomputes the entire hash chain forward but keeps the old signatures, because they lack the key. Hash-only verification passes on that file (proving hash-chaining alone does not catch chain recomputation), while verification *with* the key fails at the tampered line. One test demonstrates both the limitation and the fix.
- **Real directory client + factory + confinement + live smoke (`0613247`), 48 tests.** The real Management API client wired behind the shared interface (private-key JWT). A factory selects mock vs real, defaulting to mock. Live smoke against a real org passed, and surfaced the name-vs-id seam (AD-13), which was closed by a canonical resolution flow with a regression test that passes a protected id alias and stays fail-closed.
- **Seed script (`ab72201`), 50 tests.** An idempotent, non-destructive, prefix-confined setup script reproduces the demo fixture in any org; the first live run doubled as the idempotency proof.
- **Demo-prep hardening (`a099b59`, `415dd6c`, `49d91c1`), up to 54 tests.** Three runtime-path seams (approve/deny not loading env, a module-mode evaluation, and cwd-relative pending-store paths) each found by tracing the real launch path before the demo, not by a failing test.

## Proven live

- **Out-of-band gate, end to end.** Against a real org: a read (Tier 1), a revoke that returned pending while the user stayed in the group, an out-of-band approval that then removed the membership with paired fingerprints, a deny that left a user untouched, and a Tier 2 grant that executed. `verifyChain` over the full signed log returned `{ok: true}`. One honest note surfaced in the process: a first approval failed *closed* because the env was mock while the server ran real, the worst case of that misconfiguration is a spurious refusal, never a spurious execution.
- **Two-system cascade, 2.8s.** An approved revoke removed a group membership, and ~2.8 seconds later that user was deprovisioned in a second system entirely, through the directory's own provisioning, verified at the far end rather than merely claimed.
- **Hostile-profile injection.** A real active user's display name was set to an injection payload in the directory; the read created no pending, on-disk state was byte-identical before and after, and the field was restored. The live run also surfaced AD-18 (the SDK omits the field on the live read path), which disciplined the paper's injection claim.

## Adversarial testing (go-appsec method, offline, zero credentials)

- **Probe A, gate bypass.** 12 scenarios, 11 held, 1 gap (blank justification), closed the same session (86 tests). Each held because of a specific server-side or out-of-band mechanism, not because the model chose to behave.
- **Probe B, audit integrity.** 10 cases against `verifyChain`, 7 held, 3 gap (the deletion-evidence family), all three later closed by the verify-time assertion in ADR-0003 (96 → 102 tests).
- **Probe C, input boundary.** An extended mock suite (all held) plus a live single-user verification (108 tests).

## Self-assessment

Scored against a public five-part AI-agent governance rubric, with the low scores published rather than rounded up: **Audit trail 74, Policy enforcement 71, Human oversight 70, Error handling 66, Revocation 58.** Revocation is lowest because the credential the whole gate sits behind is scoped organization-wide (AD-6): the gate is a real mechanism and the hand behind it is broad, which are two different axes. A broad credential does not weaken the gate; it widens the blast radius if the gate is ever bypassed.

## Reliability note (for the workflow analysis)

Several of the most instructive findings were *not* caught by the tasks' own acceptance criteria. Five (later six) dev-vs-runtime seams, two honest-confidence findings, two cross-system operator seams, and two adversarial-pentest gaps were caught by on-disk validation, the live run, or deliberate adversarial testing. The recurring lesson: acceptance criteria bound the agent; validation, live exercise, and adversarial testing bound the acceptance criteria.
