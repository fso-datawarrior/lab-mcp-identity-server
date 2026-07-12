# lab-mcp-identity-server

MCP server that lets an AI assistant perform scoped Okta identity operations with an out-of-band human-approval gate on destructive actions.

**(Demonstration)**

## What this is

An MCP server that gives an AI scoped identity tools (lookup, provision, grant, revoke) against Okta, with an out-of-band human approval gate on destructive actions. This is a demonstration build for learning and lab use, not production software.

## Identity Lab Series

| Lab | Repo | Status |
| --- | --- | --- |
| Lab 1 Okta SCIM Lifecycle Server | [lab-okta-scim-server](https://github.com/fso-datawarrior/lab-okta-scim-server) | Complete |
| Lab 3 MCP Identity Server | this repo | In progress: M1 |

## Run the full chain

An approved revoke in this lab removes an Okta group membership. That membership change cascades into Lab 1's SCIM deprovisioning path. See [lab-okta-scim-server](https://github.com/fso-datawarrior/lab-okta-scim-server) for the SCIM lifecycle side of the chain.

**Current milestone: M1 (tool surface scaffold).**

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

## License

MIT. See [LICENSE](./LICENSE).