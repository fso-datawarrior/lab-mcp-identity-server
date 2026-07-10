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

## License

MIT. See [LICENSE](./LICENSE).