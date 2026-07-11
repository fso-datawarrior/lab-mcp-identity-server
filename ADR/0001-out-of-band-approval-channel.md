# ADR-0001: Out-of-band approval channel for destructive identity operations

**Status:** Accepted
**Date:** 2026-07-11
**Deciders:** Jamie (approver), assistant (proposer)

## Context

Lab 3 gives an AI assistant tools to operate an Okta directory. The central claim is that a destructive action (revoke access, deactivate a user, or a grant into a protected group) must never be executable by the model alone. A human has to authorize it. An earlier design used a confirmation token resolved by an MCP tool; the review found the model can call that tool itself using the token it was handed, so it is a convention, not a control. We need resolution to be impossible for the model by construction.

## Decision

Destructive (Tier 3) operations are gated by an out-of-band approval channel: a Tier 3 tool creates a durable pending request and returns only a requestId; resolution happens in a separate local CLI that presents an approver credential compared server-side; no MCP tool resolves anything (asserted by a test); the pending store is durable, single-use, and TTL-bounded; preconditions are re-checked at approval time and the engine fails closed on drift, expiry, wrong credential, and already-resolved; every create and resolution writes a hash-chained audit line, with the AI actor fingerprint on the request and the human approver fingerprint on the resolution.

## Consequences

Positive: the model cannot self-approve by construction; the property is demonstrable and testable without credentials; it survives restarts and refuses stale or replayed approvals; it matches the bounded-agent-governance principles. Negative and costs: the demo has two processes (the MCP server and the approval CLI); exactly-once execution is not guaranteed across a crash (the executor runs before the approved status is persisted), mitigated by an approving marker or idempotent executors in the real client; the approver credential is a shared secret, not a full identity (a production system would bind approval to an authenticated human, where the two-token on-behalf-of pattern applies). Alternatives: in-band confirm tool (rejected, the model can call it); MCP elicitation (deferred, client-dependent); local HTTP approval page (viable, heavier, can be added later on the same engine).
