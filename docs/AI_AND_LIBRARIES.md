# AI assistance and libraries

Disclosed as the hackathon rules ask (Q-005).

## AI assistance

The game's design, code, tests and documents were written with Claude Code during the hackathon window, directed by the project's human team.

## Baseline

There is no earlier code. All of it was started during the hackathon.

## Libraries

| Library | Used for |
| --- | --- |
| `near-sdk` | Contract |
| `borsh`, `serde`, `serde_json` | Serialization |
| `cargo-near` | Contract build |
| `near-kit` | Browser and script transactions |
| `@fast-auth-near/browser-sdk`, `@fast-auth-near/javascript-provider`, `near-api-js`, `buffer` | NEAR Auth login |
| `react`, `react-dom` | Web client |
| `vite`, `@vitejs/plugin-react`, `typescript` | Web build |
| `@fontsource/fredoka` | Type |

## External services

| Service | Used for |
| --- | --- |
| NEAR testnet RPC (`rpc.testnet.fastnear.com`) | Reads and transactions |
| NEAR Intents 1Click (`1click.chaindefuser.com`) | Live `dry: true` quotes |
| NEAR testnet helper (`helper.nearprotocol.com`) | Free guest accounts |
| NEAR Auth testnet | Optional Google and email login |
| NEAR AI Cloud | Optional, for agent houses |
