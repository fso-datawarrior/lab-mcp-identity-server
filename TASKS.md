# TASKS.md

> Note: this file may be normalized later by the PMO task template. Task IDs below are stable for now.
> M4-c seams: AD-16 (cloudflared config.yml catch-all — resolved operationally) and AD-17 (correlator false-negative on lossy Lab 1 log — code-closed both sides). AD-14 code-closed (L3-M4-04).

## Next (M2)

## Later (M3-M5)

- [ ] **L3-M5-01** Least-privilege writeup
- [ ] **L3-M5-02** go-appsec pentest
  - Probe A (offline gate-bypass suite) merged via feat/m5-pentest-gate-bypass: 12 adversarial tests, 11 HELD; 1 GAP found (AD-9 blank/whitespace justification) now CLOSED via feat/m5-ad9-justification-nonempty (REQUIRED_JUSTIFICATION, non-empty trimmed). docs/PENTEST-FINDINGS.md.
  - Probe B (offline audit-integrity suite) merged via feat/m5-pentest-audit-integrity: 10 adversarial tests, 7 HELD / 3 GAP (AD-2 deletion-evidence: tail-truncation, empty file, absent file verify ok). docs/PENTEST-FINDINGS.md.
  - Probe C (live hostile-profile injection) still pending.
- [ ] **L3-M5-03** BREAK-GLASS / checklist / asqav docs

## Done

- [x] **L3-M1-01** Scaffold repo
- [x] **L3-M1-02** MCP stdio server + `get_user`
- [x] **L3-M1-03** Real Okta client + name<->ID resolution
- [x] **L3-M1-06** Seed-demo script
- [x] **L3-M1-04** Hash-chained audit module
- [x] **L3-M1-05** Mock-Okta mode + hostile-display-name test
- [x] **L3-M2-01** `provision_user` + `grant_access`
- [x] **L3-M2-02** Protected-group guard
- [x] **L3-M3-01** Out-of-band gate + durable pending state
- [x] **L3-M5a** Recursive audit redaction + exactly-once approving marker
- [x] **L3-M5b** Optional HMAC-signed audit entries
- [x] **L3-DEMO-01** Real-mode entry + approval CLI wiring + live demo runbook (a099b59)
- [x] **L3-DEMO-01b** Module-mode verifyChain evidence command + configurable approval TTL (415dd6c)
- [x] **L3-DEMO-01c** Desktop launcher pins cwd for shared pending store (49d91c1)
- [x] **L3-DEMO-02** Client mode stamp on pending requests + resolver mismatch refusal (82b3fb9)
- [x] **L3-DEMO-03** Smoke test eventual consistency + bob self-heal (7103ecc)
- [x] **L3-DEMO-live** Live end-to-end gate demo run (2026-07-13)
- [x] **L3-M4-01** Lab 1 cascade harness: read-only preflight + offline timeline correlator (b434eea; AD-17 correlator `--scim-id` fallback 1ec9160)
- [x] **L3-M4-02** Okta SCIM wiring: lab3-demo-group assigned to "AI Platform (Demonstration)" (0oa151n0671V7qDK9698)
- [x] **L3-M4-03** Live two-lab cascade verified 2026-07-13: approved revoke on ACTIVE lab3-demo-carol -> SCIM PATCH active:false into Lab 1 (~2.9s, active=false confirmed); smoke:okta 5/5
- [x] **L3-M4-04** AD-14 preflight hardening: app-wiring marked UNVERIFIED + manual checklist when okta.apps.read absent (branch feat/ad14-preflight-hardening, 314baa2)
