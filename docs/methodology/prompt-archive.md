# Prompt Archive (curated)

*How the build was actually driven, captured as a prompt-engineering artifact. Companion to the [whitepaper](../whitepaper/even-a-compromised-model.md). This is a representative selection; it shows the loop, two full verbatim build prompts, and the patterns that recur across all of them.*

## The build loop

The build ran as a two-role split. A planner/validator wrote one prompt at a time with explicit acceptance criteria and never edited the repository. An implementer created the repo, wrote all the code, ran the build and tests, committed, and pushed. After each handoff the planner validated by reading the actual files on disk, recorded the evidence, and only then issued the next prompt. Verification was always against durable ground truth (disk, git, real directory state), never against the implementer's own report of what it did. The same rule the shipped server enforces at runtime governed the build.

Two supporting practices mattered:

- **Handoff-integrity check.** Before accepting any reply, two questions in order: is this reply even an answer to the prompt I sent, and is the work correct? Every prompt named the concrete artifacts (branch, test file, commit) its reply had to mention, so a stale or mis-pasted reply was obvious at a glance. One such mis-fire happened and was caught immediately this way.
- **Model independence.** The process held across a mid-build change of the underlying model. The controls live in the artifact and the review loop, not in any one model's behavior.

## Recurring patterns (the reusable part)

- Every prompt names a **single unit of work**, states the **design intent** behind it, lists tasks concretely, and ends with explicit **acceptance** and **finalize** steps. The acceptance step is what let the planner validate cheaply.
- Security-critical prompts **state the invariant in words first** ("fail closed," "never write the raw secret," "no MCP tool resolves") and then **require a test that proves it**.
- **Grounding facts** (directory behaviors: staged-on-create, idempotent group-add, org-wide scopes) were injected into the prompt so the mock did not encode fiction.
- **Constraints repeat every time** (stderr-only logging, keep existing tests passing, no secrets in any committed file), which kept drift out.
- When validation surfaced a seam the acceptance criteria missed, the fix prompt **encoded the ordering of the security checks as an explicit numbered design** ("classify on the canonical name, never the raw input") and demanded a named regression test, so the property survives future edits.
- A penetration-test pass is **test-only and docs-only**, with a hard rule against touching `src/`, so a gap is *documented as a finding* rather than silently coded away. A real gap found by a probe is then closed by a **separate, explicitly-a-fix prompt** on its own branch, keeping the record honest about what the probe found versus what the fix changed.
- Feature work is created **on a branch and stops before merge** for on-disk validation, then merges via a separate prompt.

## Example 1: the out-of-band approval gate (the security core)

```
CONTEXT
Wire the out-of-band approval gate on top of the durable pending store. Add the two
destructive tools, the resolution wrapper, the approval CLI, the exposure-boundary test,
and commit the approved ADR. Mock-first, zero credentials.

DESIGN INTENT (ADR-0001): Tier 3 tools (revoke_access, deactivate_user) do NOT execute;
they create a durable pending request and return a requestId handle. Resolution happens
only via a separate local CLI presenting an approver credential compared server-side.
NO MCP tool resolves (asserted by a test). Preconditions re-checked before executing;
fail closed on drift, expiry, wrong credential, already-resolved; executor at most once.
Every create and resolution writes a hash-chained audit line; the resolution line carries
the AI actor fingerprint AND a human approver fingerprint (SHA-256 of the credential,
never the raw secret).

TASK 1: extend the client with removeUserFromGroup and deactivateUser; mock implements both.
TASK 2: revoke_access and deactivate_user create pending (tier 3) and write a "pending"
  audit line; return { status: "pending", requestId }. Never execute.
TASK 3: resolveApproval builds a precondition + executor by tool; on a state-changing
  outcome writes one audit line with decision = status and an approver fingerprint,
  never the raw secret.
TASK 4: a CLI `resolve <approve|deny> <requestId>` reads the approver secret from env,
  prints the outcome; package scripts approve/deny.
TASK 5: refactor into a server module exporting createServer and REGISTERED_TOOL_NAMES
  (the five operational tools); register no resolver.
TASK 6: tests: revoke creates pending without removing membership; approve removes it and
  audits AI + approver fingerprints (non-null, different) and the chain verifies; deny
  leaves membership; wrong credential leaves pending and writes no resolution line;
  precondition drift fails closed; and an exposure-boundary test asserting the registered
  tool names are exactly the five, with none of approve/deny/resolve/confirm.
TASK 7: create the accepted ADR-0001 record (Status Accepted).

CONSTRAINTS: no em-dashes; server logging to stderr; never write the raw approver secret.
ACCEPTANCE: typecheck, build, test all pass; report the total test count.
FINALIZE: commit "feat(m3): out-of-band approval gate for revoke and deactivate + CLI + ADR-0001";
push; report the commit hash and total test count.
```

## Example 2: an adversarial penetration-test pass (test-only, documents gaps)

```
Task: offline gate-bypass adversarial pentest suite (go-appsec method)

Context: This is a red-team pass, not a feature. Do NOT modify any src/ code to make a
scenario pass. If a scenario reveals a real bypass or fail-open, STOP and report it as a
finding; do not change the control to hide it.

Before writing tests, read and briefly report the actual entry points (tier classification,
the out-of-band resolver, the Tier 3 tool paths, and the server registration confirming NO
resolver tool is exposed). For each scenario below, note whether existing tests already
cover it.

Add a pentest test file (mock mode, zero credentials). Each scenario asserts the control
FAILS CLOSED (no membership/lifecycle change, plus an audited denial or pending):
  a. No self-approval: the MCP surface exposes NO resolver; a Tier 3 call returns pending
     and cannot be resolved via any registered tool.
  b. Tier-downgrade via id-alias: for a protected group, pass its raw id, its name,
     mixed-case, whitespace-padded, and a unicode-lookalike form; each must classify Tier 3.
  c. Demo-confinement bypass: an out-of-allowlist target is refused before any client call.
  d. Unclassifiable tier: a target that does not resolve to a positive tier denies-and-audits.
  e. Tier 3 without justification: omitting justification is rejected.
  f. Single-use token replay; g. expired pending; h. drifted precondition;
  i. client-mode mismatch: loud refusal, request stays pending.

Create a findings doc with a table (scenario | expected | actual | verdict HELD/GAP |
severity). State up front that this is one go-appsec-method, logic-level pass in mock mode.
Make no claim stronger than "these probes ran; these controls failed closed; these gaps remain."

If any scenario does NOT fail closed, STOP and report it as a finding; do not edit src/ to
force it green. Commit on a branch and STOP for validation. Do NOT merge.
```

*(This pass found one real gap: a blank justification satisfied the "justification required" check. It was closed by a separate, explicitly-a-fix prompt that changed the schema to reject empty/whitespace values, on its own branch, so the record stays honest about what the probe found versus what the fix changed.)*

## Note

This is a curated selection of the prompts that drove the build. The full internal archive holds the complete sequence (repo scaffold, each tool, the hardening passes, the two-system cascade harness, and the closing documentation) in the same one-unit-of-work-with-acceptance-criteria form shown above.
