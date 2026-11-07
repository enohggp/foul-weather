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

## Sound and voice

| Asset | How it was made | License |
| --- | --- | --- |
| Pip's voice, `web/public/voice/` | Recorded with [`scripts/make_voice.py`](../scripts/make_voice.py), from the [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) speech model through `kokoro-onnx`, with `praat-parselmouth` shaping the melody of each sentence to suit its mood. None of these is needed to play. | Kokoro-82M is Apache-2.0, `kokoro-onnx` is MIT, `praat-parselmouth` is GPL-3.0 and is used only as a recording tool |
| Music, sea, gulls and effects | Generated in the browser by [`web/src/soundscape.ts`](../web/src/soundscape.ts) and `web/src/audio.ts`. The tune was written for this game. | Same as this project |

## External services

| Service | Used for |
| --- | --- |
| NEAR testnet RPC (`rpc.testnet.fastnear.com`) | Reads and transactions |
| NEAR Intents 1Click (`1click.chaindefuser.com`) | Live `dry: true` quotes |
| NEAR testnet helper (`helper.nearprotocol.com`) | Free guest accounts |
| NEAR Auth testnet | Optional Google and email login |
| NEAR AI Cloud | Optional, for agent houses |
