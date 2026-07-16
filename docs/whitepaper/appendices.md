# Even a Fully Compromised Model Cannot Deprovision a User Alone: Appendices
### Companion appendices to the whitepaper body

*Appendix A is the assumption ledger, B holds two verbatim build prompts, C is a redacted excerpt of the live run of 2026-07-15, and D collects the reproducibility tables. The full hash-chained log of that run is preserved locally as the run's audit log; the excerpt in Appendix C is redacted.*

---

## Appendix A. The assumption ledger (AD-1 through AD-19)

This is the provenance spine the body draws on. Each entry is one assumption the design walked in with, the point at which it broke, the mechanism that replaced it, and the residual that survives. The reversals in section 4 are AD-1 through AD-4; the seam family in section 5 is AD-13 through AD-17 plus AD-18; the pentest in section 6 turned on AD-9 and AD-11; the recovery-runbook gap in section 7 is AD-19. Commit anchors are in appendix D and the build-evidence record.

| ID | Assumption, as first held | Why it did not hold | Resolution and residual | Status |
|----|---------------------------|---------------------|-------------------------|--------|
| AD-1 | A separate confirm tool keeps the human in control of a destructive action. | The confirm tool lived on the MCP surface the model calls, and the token was returned to the model, so the model could resolve its own pending action. | Out-of-band gate: confirmation is not a tool, it is a local channel the model cannot reach, authenticated by a credential the model never sees (ADR-0001). The one by-construction claim. Live single-secret residual: approver and expected credential are the same secret, so the live property is process separation plus the no-resolver boundary, not an independent approver identity. | Closed; confirmed live |
| AD-2 | An append-only JSONL log with actor fingerprinting is a trustworthy audit trail. | Fingerprinting says who acted, not whether the file was altered; append-only was a naming convention on an editable file. | Hash chain plus optional keyed signature (tamper-evidence); deletion-evidence via a verify-time expected count and head (ADR-0003). Residual: verify-time, not caller-independent; in-process key. | Closed with a named residual |
| AD-3 | Reading user data from the directory is a safe, read-only operation. | Attacker-controllable profile fields flow into the model's instruction space, so a read becomes a write into the model's instructions. | Input trust boundary: strip control and zero-width characters, never interpolate raw. Residual: contains, does not prevent; the structural gate stops action, not the sanitizer; see AD-18 for the live read path. | Closed with a named residual |
| AD-4 | Additive operations are low risk, so grants can flow without approval. | A grant into an administrative group escalates privilege as surely as a removal. | Tier by target sensitivity via a server-side allowlist; grants into protected groups are gated. | Closed |
| AD-5 | In-memory pending state is fine for a demo. | A restart loses a pending action or makes a token replayable against a directory whose state has drifted. | Durable, single-use, TTL-bounded pending state; precondition re-check at approval; at most once across a crash. | Closed |
| AD-6 | Least privilege can be enforced by the credential. | Okta OAuth scopes are organization-wide, so confinement is a code-level control, not a token-level one; the assigned role is maximal. | Minimum scopes used plus code-level demo confinement, stated as an honest limit. Residual: broad credential (scored Revocation 58). | Named limit, carried to Lab 4 |
| AD-7 | The Okta lifecycle can be modeled as simple verbs, and delete is one tool. | A delete requires a prior deactivation and is irreversible; a group removal leaves the user active. | delete_user cut; deactivation is the top destructive tier; the three destructive shapes kept distinct. | Closed |
| AD-8 | The MCP server does not need to authenticate its caller. | Whoever reaches the transport drives tools holding a live credential; the principal had no authentication behind it. | Strictly local stdio, no inbound tunnel; caller recorded as a configured label. Residual: a label, not an authenticated identity. | Named limit, carried to Lab 4 |
| AD-9 | The audit trail only needs to capture the mechanical action. | It captured what happened, not why; and a required justification accepted an empty string, found by Probe A. | Required non-empty justification, logged verbatim and shown to the approver. | Closed (same session as found) |
| AD-10 | Naming the governance principles is enough to embody them. | Fail-closed and no-self-permissioning were asserted in prose while the design broke both. | The interceptor denies and audits any call it cannot positively classify; the out-of-band gate makes no-self-permissioning true by construction. | Closed |
| AD-11 | The lab could publish having tested some of the way, deferring the pentest. | For a server performing destructive live identity operations, deferring the gate-bypass pentest is the wrong call. | A go-appsec-method pentest ran, Probes A, B, and C; the honest claim is partially pentested with gaps named. | Closed |
| AD-12 | A stranger could clone the repository and try it. | Running it required an Okta org, a service app, a seed, and for the full chain a second lab and a tunnel; no zero-credential path existed. | A sample environment file, a seed script, and a mock mode; 108 zero-credential tests; break-glass and checklist docs. | Closed |
| AD-13 | A group identifier is one kind of string. | Real Okta groups carry both an id and a name; a classifier keyed on the name could be routed around by passing a protected group's id alias. | Canonical resolve-then-classify-then-allowlist ordering enforced as a security property. Heads the dev-vs-runtime seam family. | Closed |
| AD-14 | An empty application-assignment read proves no applications are assigned. | A missing scope returned an empty list rather than an authorization error, so the check reported a confident zero it could not vouch for. | Scope-driven detection that reports unverified rather than a false zero. | Closed; fails closed |
| AD-15 | The staged demo users would provision and cascade downstream. | Okta provisions an application assignment only for users it will push, so a staged user generates no downstream record to deprovision. | A dedicated active cascade user. | Closed; fails closed |
| AD-16 | A quick tunnel invocation is self-contained. | The tunnel client auto-loads a default config whose catch-all rule returned a blanket not-found for the quick tunnel. | An isolated config on invocation. | Resolved operationally; fails closed (a second instance recurred 2026-07-15 and also failed closed) |
| AD-17 | The correlator will match the real downstream deprovision. | The downstream log recorded the operation without the field that proved it was a deprovision, so the correlator could never match it. | The downstream now records the full operation; the correlator adds a bounded, asserted-id fallback and otherwise refuses to guess. Confirmed end to end 2026-07-15: automatic no-caveat match. | Closed both sides; confirmed live; fails closed |
| AD-18 | The directory SDK surfaces every profile field the server maps. | The Okta Node SDK (v8) typed getUser response omits the display-name field on the live path, while surfacing the login field from the same object, so the untrusted string the offline suite exercises never reaches the model in production. | No code change; recorded as a runtime characteristic and a sixth dev-vs-runtime seam. The data-not-instruction property is carried by the offline suite; the structural claim (no pending created) holds live. | Characterized live 2026-07-15; fails closed (untrusted field never reaches the model) |
| AD-19 | The documented environment kill-switch disables live access on the desktop path. | The desktop launcher hard-codes the real client mode into the process environment, overriding the value the runbook tells the operator to change. | The launcher now defaults the mode to real only when unset and the desktop config no longer pins it, so the documented kill-switch works on the desktop path. | Closed 2026-07-16 (launcher `??=` + runbook config); fails safe (defaults to real) |

Two properties of this table are worth stating outright. First, every seam in AD-13 through AD-18 failed closed when it manifested, so none created exposure; the one gap that did not fail closed in the same clean way was the AD-2 deletion-evidence boundary, which is exactly why the body names it loudly. Second, the resolution column never contains the phrase the model behaved, because a residual that depends on model restraint is not a mechanism.

---

## Appendix B. Selected verbatim build prompts

The build ran as a sequence of single-unit prompts, each stating a design intent, listing concrete tasks, and ending in explicit acceptance and finalize steps, with the same constraints repeated every time (all logging to standard error, keep every existing test passing, push as the project identity, no em dashes). The full archive of prompts is held in the project provenance layer and is summarized in the methodology docs. Two are reproduced here: the security centerpiece and one adversarial pass, because together they show the two disciplines the method depends on, building a control and then trying to break it without being allowed to quietly repair it.

### B.1 The out-of-band gate (task L3-M3b, commit 3a59f793)

```
CONTEXT
Wire the out-of-band approval gate (L3-M3b) on top of pendingStore. Add the two destructive tools, the resolution wrapper, the approval CLI, the exposure-boundary test, and commit the approved ADR. Mock-first, zero credentials.

DESIGN INTENT (ADR-0001): Tier 3 tools (revoke_access, deactivate_user) do NOT execute; they create a durable pending request and return a requestId handle. Resolution happens only via a separate local CLI presenting an approver credential compared server-side. NO MCP tool resolves (asserted by a test). Preconditions re-checked before executing; fail closed on drift, expiry, wrong credential, already-resolved; executor at most once. Every create and resolution writes a hash-chained audit line; the resolution line carries the AI actor fingerprint AND a human approver fingerprint (SHA-256 of the credential, never the raw secret).

TASK 1: extend OktaClient with removeUserFromGroup and deactivateUser; mock implements both.
TASK 2: revokeAccess and deactivateUser tools create pending (tier 3) and write a "pending" audit line; return { status:"pending", requestId }. Never execute.
TASK 3 (resolveApproval.ts): load pending; build precondition + executor by tool; call resolvePending; on a state-changing outcome write one audit line with decision = status, approverCredential = fingerprint, never the raw secret.
TASK 4 (cli/resolve.ts): CLI resolve <approve|deny> <requestId>, reads APPROVAL_SECRET from env, prints outcome, exit 0 on resolved. Scripts approve/deny.
TASK 5: refactor into server.ts exporting createServer and REGISTERED_TOOL_NAMES (the five operational tools); register no resolver.
TASK 6: tests: revoke creates pending without removing membership; approve removes membership and audits AI + approver fingerprints (non-null, different) and chain ok; deny leaves membership; wrong credential leaves pending and writes no resolution line; precondition drift fails closed; exposure boundary asserts REGISTERED_TOOL_NAMES has the five tools and none of approve/deny/resolve/confirm/confirm_action.
TASK 7: create ADR/0001-out-of-band-approval-channel.md with the approved ADR content (Status Accepted).

CONSTRAINTS: no em-dashes; server logging to stderr; never write the raw approver secret to the audit log, only a fingerprint.
ACCEPTANCE: typecheck, build, test pass; total test count.
FINALIZE: move L3-M3-01 to Done; commit "feat(m3): out-of-band approval gate for revoke and deactivate + approval CLI + ADR-0001"; push as fso-datawarrior; report commit hash and total test count.
```

### B.2 An adversarial pass, and the discipline that makes it evidence (task L3-M5-02 Probe A)

The pentest prompts carry one rule the feature prompts do not, and it is the rule that turns a pass into evidence rather than into a quiet repair:

```
Context: This is a red-team pass, not a feature. Do NOT modify any src/ code to make a scenario pass. If a scenario reveals a real bypass or fail-open, STOP and report it as a finding; do not change the control to hide it.
...
5. Create docs/PENTEST-FINDINGS.md ... State up front that this is one go-appsec-method, logic-level gate-bypass pass in mock mode, and that the go-appsec proxy tooling does not apply to a stdio server (method adopted, not transport). Make no claim stronger than "these probes ran; these controls failed closed; these gaps remain."
```

The gap this pass found, the blank-justification acceptance, was closed by a separate, explicitly-a-fix prompt on its own branch, so that the record stays honest about what the pentest found versus what the fix changed. That separation is the appendix's real point.

---

## Appendix C. Redacted audit-log excerpt

This excerpt is drawn from the single continuous run of 2026-07-15, whose hash-chained log is preserved in full in the run's local audit log. Redaction masks any secret-shaped value and abbreviates the fixed-length entry hashes and signatures as `<sha256>` and `<hmac-sha256>`; the actor and approver fingerprints are shown as the short hashes they are, and the raw approver credential is never present in the log by construction. The Tier 1 read below is shown verbatim from the run with only its hashes abbreviated; the Tier 3 pending, approved, and denied lines are shown in the log's exact schema with hash, signature, and target-identifier values redacted, because the point of the excerpt is the field structure and the paired fingerprints, not the specific identifiers.

A Tier 1 read: one executed audit line, no approval, justification and approver null.

```json
{"timestamp":"2026-07-15T17:49:15.903Z","tool":"get_user","tier":1,"actorFingerprint":"3f3bb4a16977","principal":"claude-desktop","targetUser":"<okta-user-id>","args":{"userId":"<okta-user-id>"},"justification":null,"decision":"executed","approverCredential":null,"oktaSummary":"read user <okta-user-id>","prevHash":"<sha256>","entryHash":"<sha256>","sig":"<hmac-sha256>"}
```

A Tier 3 revoke request: creates a pending and does not execute, so the membership is unchanged. Decision pending, justification present and destined for the approver prompt, approver still null.

```json
{"timestamp":"<ts>","tool":"revoke_access","tier":3,"actorFingerprint":"3f3bb4a16977","principal":"claude-desktop","targetUser":"<okta-user-id>","args":{"userId":"<okta-user-id>","group":"lab3-demo-group","groupId":"<okta-group-id>","groupName":"lab3-demo-group"},"justification":"<operator justification shown to the approver>","decision":"pending","approverCredential":null,"oktaSummary":"pending: revoke_access on <okta-user-id>","prevHash":"<sha256>","entryHash":"<sha256>","sig":"<hmac-sha256>"}
```

The out-of-band approval: executed only after the human ran the separate approver process. Decision approved, and the line carries two distinct fingerprints, the AI actor and the approver credential, both present and different. One honest qualifier the body also carries: in the demonstration's single-secret wiring the approver credential and the server's expected credential are the same secret, so the fingerprint pairing evidences an out-of-process resolution step, not an independent approver identity. The raw approver secret is never written.

```json
{"timestamp":"<ts>","tool":"revoke_access","tier":3,"actorFingerprint":"3f3bb4a16977","principal":"claude-desktop","targetUser":"<okta-user-id>","args":{"userId":"<okta-user-id>","group":"lab3-demo-group","groupId":"<okta-group-id>","groupName":"lab3-demo-group"},"decision":"approved","approverCredential":"<approver-fingerprint>","oktaSummary":"approved and executed: revoke_access on <okta-user-id>","prevHash":"<sha256>","entryHash":"<sha256>","sig":"<hmac-sha256>"}
```

The deny beat: a deactivate request that returned pending and then resolved denied, the user unchanged.

```json
{"timestamp":"<ts>","tool":"deactivate_user","tier":3,"actorFingerprint":"3f3bb4a16977","principal":"claude-desktop","targetUser":"<okta-user-id>","args":{"userId":"<okta-user-id>"},"decision":"denied","approverCredential":"<approver-fingerprint>","oktaSummary":"denied: deactivate_user on <okta-user-id>","prevHash":"<sha256>","entryHash":"<sha256>","sig":"<hmac-sha256>"}
```

One fail-closed beat leaves no line to show, and the absence is itself the record. A Tier 3 request with a whitespace-only justification is rejected at the schema boundary before any pending is created, so it produces a tool error and writes no audit entry, which is the AD-9 fix behaving as designed.

Verification over the full run log returned a clean result, both hash-only and with the keyed signature checked on every entry, and again after stale pending was cleared, under the deletion-evidence assertion that supplies an independently held entry count and head:

```
{"ok":true}
```

The verbatim four-line excerpt, with the real hashes, signatures, and identifiers intact, can be lifted directly from the run's local audit log at final assembly if the paper is to carry real hash values rather than the redacted schema shown here.

---

## Appendix D. Reproducibility tables

### D.1 The ten seams (section 5 roster)

| # | Seam | Class | Caught by | When | Commit / resolution | Failed closed |
|---|------|-------|-----------|------|---------------------|---------------|
| 1 | Name-vs-ID classification | dev-vs-runtime | On-disk validation | Pre-live | 06132473 (L3-M1-03b) | Yes |
| 2 | Module-mode eval command | dev-vs-runtime | Tracing the command | Pre-live | 415dd6c (L3-DEMO-01b) | Yes |
| 3 | Cwd-relative data paths | dev-vs-runtime | Tracing the launcher | Pre-live | 49d91c1 (L3-DEMO-01c) | Yes |
| 4 | Client-mode mismatch | dev-vs-runtime | Live demo run | Live only | 82b3fb9 (L3-DEMO-02) | Yes |
| 5 | Okta eventual consistency | dev-vs-runtime | Live smoke run | Live only | 7103ecc (L3-DEMO-03) | Yes |
| 6 | SDK omits display-name field | dev-vs-runtime | Live injection run | Live only | AD-18 (runtime characteristic, no code change) | Yes |
| 7 | Empty app-read as proof | honest-confidence | Live preflight | Live | 189a217 (L3-M4-04) | Yes |
| 8 | Staged vs active cascade | honest-confidence | Wiring analysis | Pre-live | M4-c dedicated active user | Yes |
| 9 | Tunnel config bleed | operator-environment | Live cascade run | Live | Isolated config (AD-16) | Yes |
| 10 | Lossy-audit false-negative | operator-environment | Live cascade run | Live | 1ec9160 (Lab 3) + f3006a0 (Lab 1) (AD-17); confirmed end to end 2026-07-15 | Yes |

Split: three caught pre-live by tracing the runtime path on disk (1, 2, 3, plus the analysis catch 8); the rest surfaced only under a second real process, a real eventually-consistent directory, or the real directory SDK against a real profile (6). Every one failed closed.

### D.2 The three probes (section 6 roster)

| Probe | Surface | Scenarios | Held | Gap | Disposition | Reproducible |
|-------|---------|-----------|------|-----|-------------|--------------|
| A | Gate bypass | 12 | 11 | 1 (AD-9 blank justification) | Gap closed same session | Yes, zero credentials |
| B | Audit integrity | 10 | 7 | 3 (deletion-evidence family) | Closed with a named boundary (ADR-0003) | Yes, zero credentials |
| C | Live hostile-profile injection | 6 offline scenarios + 1 live | 6/6 offline; live structural only | 0 | Live existence proof, witnessed once. AD-18 removed the field from the live read path, so the live run proves only the structural no-pending property; the data-not-instruction property is carried offline. | Mock yes; live no |

Note on the offline injection evidence. Probe C's own roster is six offline scenarios (in tests/pentest-injection-boundary.test.ts). The data-not-instruction property that section 6 and section 7 credit to the offline layer is carried by a broader ten-test offline injection suite, namely test/getUser.test.ts (four cases, including the seeded hostile display name read through the handler and returned as sanitized inert data) plus tests/pentest-injection-boundary.test.ts (six cases). That ten-test suite ran green (ten of ten) on 2026-07-15. The "six" and the "ten" are different groupings, the probe roster and the property's full offline coverage, and the body uses the ten-test figure when it credits the offline layer with the data-not-instruction property.

### D.3 The pending-approval state machine (AD-5)

A pending request starts at `pending`. Resolution is attempted in a fixed order and fails closed at each guard: an unknown id returns without effect; an already-resolved request returns already-resolved; an expired request moves to `expired` with no execution; a wrong credential returns and leaves the request `pending`; a deny moves to `denied`; a client-mode mismatch is refused loudly and leaves the request `pending`. On approve, the precondition is re-checked: on drift the request moves to `drift-failed` with no execution; otherwise the request is marked `approving` and persisted before the executor runs, so a crash mid-execution leaves a visible `approving` marker and a retry returns already-resolved rather than running the executor twice, then the request moves to `approved`. The terminal states are `approved`, `denied`, `expired`, and `drift-failed`, and every transition writes a hash-chained audit line.

### D.4 The test-count spine

The suite grew monotonically across the build, which is the reproducibility signal the method leans on: `7, 11, 16, 24, 31, 37, 41, 48, 50, 51, 54, 57, 66, 74, 86, 96, 102, 108`. Milestones on that curve: 31 at the out-of-band gate close (M3), 48 at the name-vs-ID seam close, 66 at the cascade harness, 86 after Probe A, 96 after Probe B, 102 after the deletion-evidence assertion, and 108 after Probe C. All 108 pass with zero credentials, and the 2026-07-15 live run added no test (it exercised the shipped artifact and the runbooks against the real directory rather than changing code).
