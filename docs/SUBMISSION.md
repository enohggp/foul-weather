# Submission kit

Everything here is a draft for the team to check and send. Nothing has been posted or submitted.

## Before you submit

- [ ] The repository is public. Replace `<this repository>` in the README with its address.
- [ ] A demo post is live on X, with a video or screenshots attached.
- [ ] You have a mainnet NEAR account for the payout.
- [ ] Both tracks below are right for you.
- [ ] If anyone on the team is entering another project, read "One person, two projects" below.
- [ ] Nothing secret is in the repository history.
- [ ] You submit before 14 November 2026, 23:59 UTC. There is one attempt.

## One person, two projects

Hackathon rule Q-015 allows one person at most two different projects. Each project's README must name the other one. If this is one of two entries, add a line like this near the top of the README:

> Disclosure: the same team also entered [other project](link). The two are independent.

A third project from the same person is not allowed.

## Fields for the form

| Field | Value |
| --- | --- |
| Project name | Foul Weather |
| Tracks | `games`, `agents` |
| What they built | See below. It is under the 2,000 character limit. |

These you need to fill in yourself: team lead's name, contact email, team size, NEAR payout account, repository link, demo post link, and the consent notice.

### What they built

> Most game economies are a price table with a shop on top. Foul Weather makes risk the thing you trade, and it's simple enough for a child. You run a little harbor shop, or you take the wheel of a ship. Animal captains with their own wallets ask shops to protect their ships, the shops say yes or no, and everyone hears a bell when the ship comes home or sinks. Online, either side can be a real person, so players bargain, protect and even bluff each other. A parrot teaches one idea at a time, and each level adds a skill. Underneath is a real insurance market. Your prices decide who can afford to sail, which decides what reaches port, which decides what captains can pay you. In one great storm, shops that all passed their risk on to each other fall in a chain.
>
> NEAR runs the whole game with no server. One contract holds the rules and every token as NEP-245, including insurance policies you can sell. Anyone can move the world on with a public tick, at 4 to 6 Tgas a watch. Captains' wallets are sub-accounts with no key at all, so only the rules can move their money. Claims clear with an Eisenberg-Noe algorithm on-chain. Hidden facts, like a hull's condition, are not stored: they're drawn from block randomness the moment someone looks. Live NEAR Intents quotes set the roughness of the sea, so real markets change the game with no patch. Players start with a guest account or NEAR Auth, and never see a wallet, seed phrase or gas prompt. A public front-door key, limited by NEAR to one method, opens accounts without a server. Any AI agent can run a house through the public methods, and an example agent can use NEAR AI Cloud.
>
> The same Rust rules compile to the contract and to the browser, so practice mode and the week-in-a-minute fast-forward run the contract's real rules. In 900 bot-played seasons, signing everything failed more than half the time, while careful play more than doubled the money.

## Demo video

A recording of Pip playing the real game, with her voice and the game's sound, is at [`docs/demo/foul-weather-demo.mp4`](demo/foul-weather-demo.mp4). You can post it as it is. If you would rather talk over a shorter cut yourself, here is a script:

| Time | Show | Say |
| --- | --- | --- |
| 0:00 | The title screen | "Most game economies are shops. In this one, you don't trade the goods. You carry the risk. And a child can play it." |
| 0:08 | Pip's first lesson, a captain's card | "This otter has a real wallet. Green is what she pays me. Red is what I pay if she sinks. This meter says if it's worth it." |
| 0:20 | Tap yes, coins fly | "Yes. I'm paid straight away, and my ship gets a gold ring." |
| 0:30 | The ship comes home, or the shipwreck scene | "Two bells: safe home. One bell: I'm paying." |
| 0:42 | `?demo=spiral` at the storm | "Here's what happens when every shop has passed its risk on to another shop." |
| 0:55 | Shops toppling, then the list | "One storm, five shops. Each one failed because the last one couldn't pay." |
| 1:08 | **For grown-ups**: the live contract and a transaction | "There's no server. The contract runs the world, captains' wallets have no keys, and live NEAR Intents prices set the sea." |
| 1:18 | The game running | "It's live on testnet. Link below." |

## Demo post for X

> In most games, the economy is a shop. I built one where you don't trade goods, you protect them, and a child can play it.
>
> Say yes to an animal captain. Hear the bell. Then watch one storm take down five shops, each failing because the last one couldn't pay.
>
> No server: on NEAR, captains' wallets have no keys, so only the rules can move their money, and live NEAR Intents prices set the sea.
>
> Built at NEAR HACKATHON. Would you protect this ship?
>
> [link to game] [link to repo]
>
> @NEARProtocol @NearLegion @NearBuilders #NEARHackathon

## Hosting

`.github/workflows/pages.yml` publishes the game to GitHub Pages on every push to `main`. Set **Settings > Pages > Source** to **GitHub Actions** once. The hackathon asks that a hosted demo stays up until at least 18 November, and ideally 25 November.

The hosted page plays practice mode and the live town as a guest with no setup. Google and email sign-in needs a client id from NEAR Auth, in `VITE_FW_AUTH_CLIENT_ID`.

`.github/workflows/keeper.yml` keeps the live world moving while no one is playing. It needs one repository secret, `NEAR_PRIVATE_KEY`.
