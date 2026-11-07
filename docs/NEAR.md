# How Foul Weather uses NEAR

The chain does work here that a game server could not be trusted to do. A player never sees any of it.

## No server

One contract holds the rules, the world and every token. `tick` is public, so any player's browser moves the world on. A watch costs about 4 Tgas, because the whole world is one compact state of about 11 KB.

The browser runs the same rules through WebAssembly, compiled from the same Rust crate (`crates/core`). Practice mode and fast-forward are therefore the contract's real rules, not an imitation of them.

## NPCs with wallets that nobody can touch

Every captain, Room house and the Guild has its own NEAR sub-account, such as `ada-quill.foulweather-harbor.testnet`. `scripts/npc-wallets.mjs` creates them with no access key. No private key exists for them, so nobody can sign for them, including the deployer. Their balances move only under the contract's rules.

Check it yourself: look up any of those accounts in an explorer and see that it has no keys.

The contract's owner can still restart the world with `reset` and could redeploy the contract while this is a hackathon build. A production release would remove those powers.

## NEP-245: one contract, every token

| Token | What it is |
| --- | --- |
| `crown` | Money. Supply is fixed at 400,000 for ever. |
| `cargo:grain`, `cargo:silk` and others | Goods, minted when produced and burned when consumed. |
| `policy:<id>` | One promise to pay, held by whoever is owed. |

A policy is a real token. Whoever holds it collects on it, so a claim can be sold with `mt_transfer`. Core methods and enumeration are implemented, with `mt_transfer_call` and NEP-297 events.

The ledger lives in [`crates/nep245-ledger`](../crates/nep245-ledger), a small reusable crate with no SDK dependency. NEAR's standards library has no NEP-245 implementation, so this is useful to other builders.

## Hidden information on a public chain

Anything stored on-chain can be read, so a stored secret is not a secret. Foul Weather stores none:

- **A hull's real state does not exist** until a surveyor looks or the ship sails. Then it is drawn from fresh block randomness, close to what the town believes.
- **Whether a wreck was fraud does not exist** until someone holds an inquiry. Then it is drawn at exactly the odds the harbor could already see.

One limit: once a hull has been surveyed, that number is in contract state. The page shows it only to whoever paid, but a determined reader could look it up before the slip closes.

## Claims clearing

When several houses owe each other at once, there is no fair order of payment. `crates/core/src/clearing.rs` computes an Eisenberg-Noe clearing payment, in integers and with a bounded number of rounds. Every debtor either pays in full or hands over everything it has, pro rata. This is what lets one failure spread realistically through reinsurance, on-chain and at predictable gas.

## Accounts with no wallet

| Way in | What happens |
| --- | --- |
| Guest | The browser makes a key. A testnet account opens through NEAR's public faucet, or through the contract's front door if the faucet is busy. |
| Google or email | NEAR Auth logs the player in and derives a key held by NEAR's MPC network. That key owns the account, and a limited key on the device plays the game. |

The **front door** is a function-call key that is public on purpose and published by the contract through `front_door()`. NEAR itself limits it to calling `open_account`, and the contract caps it at 40 accounts an hour. It uses the same idea as NEAR linkdrops, and no server is needed.

New players get a key that can call only this contract, so even a stolen browser key can't move their testnet NEAR.

Google and email login on the shared testnet client only works at `http://localhost:3000`. A hosted site needs its own client id in `VITE_FW_AUTH_CLIENT_ID`. A login opened on one device can't yet be restored on another.

## NEAR Intents: the sea follows real markets

Each lane follows a real cross-chain route. A `dry: true` 1Click quote, which moves no money and needs no key, measures how choppy each route is. The mapping is in [`web/src/seaCore.ts`](../web/src/seaCore.ts). When markets turn rough, so does the water, with no patch from anyone.

| Lane | Route |
| --- | --- |
| The Salt Road | NEAR to USDC on NEAR |
| Greywater Run | NEAR to USDC on Arbitrum |
| Cinder Passage | NEAR to SOL |
| Lantern Deeps | NEAR to DOGE |
| The Aurum Cape | NEAR to Bitcoin |

Practice mode reads these directly from the browser. The live world gets them from `scripts/keeper.mjs`, and `sea_report()` publishes them for any other app to read. If nothing posts a reading, the sea drifts by itself.

**Pay from any chain** in "Under the hood" shows live quotes for a cosmetic priced in USDC and payable in other tokens. It is a preview, and nothing there can move money. Enabling it needs a mainnet treasury account, because Intents has no testnet.

## NEAR AI Cloud and agents

Any agent can run a house through the public contract methods. `scripts/agent-house.mjs` is a complete house in about 100 lines. It opens its own account, plays by simple rules with no setup, and uses NEAR AI Cloud for decisions if `NEAR_AI_API_KEY` is set. Agent houses are marked as such and appear in the Room beside human ones.

## What this does for NEAR

- **It shows normal people a NEAR app with no wallet step.** The full path from page load to a signed transaction has no popup.
- **It gives agents a live, adversarial place to prove themselves.** Pricing risk against other agents and humans is a real test of judgment, with a public record.
- **It reuses open pieces.** `nep245-ledger`, the front-door pattern and the Intents sea feed are all usable by other projects.
- **It has a path to Intents volume.** A cosmetic bought in any token would route through Intents, without putting real money into the gameplay.

As a testnet game it earns NEAR nothing today.
