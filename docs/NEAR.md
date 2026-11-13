# How Foul Weather uses NEAR

The game shows friendly names: towns, shops, coins and animal captains. The contract and this document keep the original ones for the market underneath: houses in the Room, crowns, and named captains.

The chain does work here that a game server could not be trusted to do. A player never sees any of it.

## No server

One contract holds the rules, the world and every token. `tick` is public, so any player's browser moves the world on. A watch costs about 8 Tgas and a player's move about 3 Tgas, because the whole world is one compact state of about 13 KB. Many people can play at once: each has their own account, and the more of them are online, the more the browsers spread out their ticks so they don't collide. A tick costs the contract NEAR, so a tab only sends one while it is visible and has been touched in the last two minutes. When nobody is active the world simply waits. Who counts as online is judged by the chain's clock, not by game time, which stops when nobody is playing.

The watch runs in its own receipt, with fresh randomness from a later block and a fixed 60 Tgas of its own. If it ran inside `tick`, a caller could batch it with a check that fails when their own ship sinks, undo the transaction and roll again. With less gas, a caller could make costly outcomes run out and revert. Inquiries report at the next watch for the same reason.

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
| `ship:<id>` | One ship, owned by the player who bought it. |

A policy is a real token. Whoever holds it collects on it, so a claim can be sold to another house with `mt_transfer`, whole or not at all. Crowns and cargo move only under the game's rules, because a house that could move its crowns could empty itself just before a claim fell due.

Core methods and enumeration are implemented, with `mt_transfer_call` and NEP-297 events. NEAR fails any call that logs more than 16 KB, so the busiest watches leave their last events out of the logs. The state is always complete.

The ledger lives in [`crates/nep245-ledger`](../crates/nep245-ledger), a small reusable crate with no SDK dependency. NEAR's standards library has no NEP-245 implementation, so this is useful to other builders.

## Hidden information on a public chain

Anything stored on-chain can be read, so a stored secret is not a secret. Foul Weather stores none:

- **A hull's real state does not exist** until a surveyor looks or the ship sails. Then it is drawn from fresh block randomness, close to what the town believes.
- **Whether a wreck was fraud does not exist** until someone holds an inquiry. Then it is drawn at exactly the odds the harbor could already see.

One limit: once a hull has been surveyed, that number is in contract state. The page shows it only to whoever paid, but a determined reader could look it up before the slip closes.

## Claims clearing

When several houses owe each other at once, there is no fair order of payment. `crates/core/src/clearing.rs` computes an Eisenberg-Noe clearing payment, in integers and with a bounded number of rounds. Every debtor either pays in full or hands over everything it has, pro rata. This is what lets one failure spread realistically through reinsurance, on-chain and at predictable gas.

## Ways in: guest, Google or email, or your own wallet

The game uses no NEAR tokens. Coins are game points held as NEP-245 tokens in the contract.

| Way in | What happens |
| --- | --- |
| Guest | The browser makes a key. A testnet account opens through NEAR's public faucet, or through the contract's front door if the faucet is busy. |
| Google or email | NEAR Auth logs the player in and derives a key held by NEAR's MPC network. That key owns the account, and a limited key on the device plays the game. |
| Your own NEAR wallet | [NEAR Connect](https://github.com/hot-dao/near-selector) (`@hot-labs/near-connect`) opens the player's testnet wallet: Meteor, Intear, Nightly, Ledger or NEAR CLI. During sign-in the wallet adds a key that the browser made, which can only call this contract, with a 1 NEAR gas allowance. After that, moves are signed on the device with no popup. The player's own account holds the town, its coins and ships, and is paid everything the town earns. |

The wallet path is in [`web/src/wallet.ts`](../web/src/wallet.ts). A move uses about 0.0004 testnet NEAR of the allowance, measured on testnet. A wallet's gas is the player's own, so a wallet tab never pays to move the world on. The public tick key does that.

The **front door** is a function-call key that is public on purpose and published by the contract through `front_door()`. NEAR itself limits it to calling `open_account`, and the contract caps it at 40 accounts an hour. It uses the same idea as NEAR linkdrops, and no server is needed. A second public key, from `tick_key()`, can only call `tick`, so a long session doesn't use up a player's own gas. If its allowance runs out, players' own keys take over.

Anyone can read that key, so anyone can use the front door until it hits its hourly cap or its balance floor. On testnet the worst case is that it closes for a while and new players fall back to the faucet.

New players get a key that can call only this contract, so even a stolen browser key can't move their testnet NEAR. An account from the front door holds 0.06 testnet NEAR. A move burns about 0.0003 NEAR, and NEAR reserves some up front, so that is around 150 moves.

Public testnet servers rate-limit busy addresses, so the client knows three of them and moves on when one stops answering. Each transaction is signed once and those same bytes are offered to each server in turn, so a retry can't buy something twice.

Google and email login on the shared testnet client only works at `http://localhost:3000`. A hosted site needs its own client id in `VITE_FW_AUTH_CLIENT_ID`. A login opened on one device can't yet be restored on another.

## near.social: share a moment

Players can post from their town on [near.social](https://near.social), the social network on NEAR, from their own NEAR account. The code is [`web/src/social.ts`](../web/src/social.ts), following the guide at <https://near.social/skill.md>.

- A post is one call to the account `social`, method `__fastdata_kv`, with args `{"post/<unix ms>": {"text": "…"}}`, no deposit and 1 Ggas.
- The receipt always fails with `CodeDoesNotExist`, because `social` has no contract. FastData indexes the write anyway. The game confirms it through `GET https://api2.near.social/v1/tx/{hash}`, or by reading the post back from `/v1/posts/{account}/{id}`.
- Names and pictures come from `GET https://api2.near.social/v1/accounts/{account_id}`.
- near.social's site and API only show mainnet posts, so this is the one mainnet part of the game. FastData also stores testnet writes, readable at `https://kv.test.fastnear.com`, but they never appear on near.social. The player's own wallet signs each post, and the network fee is well under a cent.

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

## Players affecting each other, on-chain

Helping, gifts, raids, talk and insurance between players are all contract methods signed by each player's own account, with no server between them. `send_gift` moves real `crown` balances from one player to another. `help_town`, `send_gift`, `raid`, `say` and `say_text` are checked by the same rules in the contract and the browser.

Typed chat goes through the contract too, so it is public and stays in transaction history. The contract refuses links, contact details and common swear words before anything is stored, and keeps only the latest 30 lines in state. Muting happens on each player's device.

## NEAR AI Cloud and agents

People can also steer the captains. `take_helm`, `plan_trip`, `sail_now`, `cancel_trip`, `scuttle` and `leave_helm` let a player sail one captain's ship while the money stays in that captain's keyless wallet, so only the rules can move it. The captain's wallet earns or loses, and the player is scored on the difference since they took the wheel.

Any agent can run a house through the public contract methods. `scripts/agent-house.mjs` is a complete house in about 100 lines. It opens its own account, plays by simple rules with no setup, and uses NEAR AI Cloud for decisions if `NEAR_AI_API_KEY` is set. Agent houses are marked as such and appear in the Room beside human ones.

## What this does for NEAR

- **It gets normal people into a NEAR app with nothing to set up, and no NEAR tokens.** A guest's path from page load to a signed transaction has no popup. NEAR users can bring their own wallet, and everything they earn is then paid to their own account.
- **It brings players to near.social.** Players can post their town's moments there from their own accounts.
- **It gives agents a live, adversarial place to prove themselves.** Pricing risk against other agents and humans is a real test of judgment, with a public record.
- **It reuses open pieces.** `nep245-ledger`, the front-door pattern and the Intents sea feed are all usable by other projects.
- **It has a path to Intents volume.** A cosmetic bought in any token would route through Intents, without putting real money into the gameplay.

As a testnet game it earns NEAR nothing today.
