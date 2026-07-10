# AGENTS.md

Guardrails for anyone (human or agent) working in this repo.

## Demonstration build

This is a demonstration Identity Lab build. Do not treat it as production software.

## Secrets

Never commit `.env`. Never print secret values to logs, chat, or tool output. Use `.env.example` as the only committed template.

## stdio transport

This MCP server targets stdio transport. **All runtime logging must go to stderr, never stdout.** stdout is the MCP protocol stream.

## Security invariant

No destructive identity action executes without an out-of-band human approval. The confirmation path is **never** exposed as an MCP tool.

## Action tiering

Tiering keys off target sensitivity, not just the verb. A grant into a protected group is destructive-tier and requires the same approval gate as a revoke.

## Audit

The audit log is hash-chained and append-only. Do not rewrite, truncate, or reorder audit records.