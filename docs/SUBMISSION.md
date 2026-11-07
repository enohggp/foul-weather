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

> Most game economies are a price table with a shop on top. Foul Weather makes risk the thing you trade. You run a marine insurance house: captains with their own wallets ask for cover, you price the voyage, and you hear a bell when the ship comes home or doesn't. Your prices decide who can afford to sail, which decides what reaches port, which decides what captains can pay you. In one great storm, houses that all passed their risk on to each other fall in a chain.
>
> NEAR runs the whole game with no server. One contract holds the rules and every token as NEP-245, including insurance policies you can sell. Anyone can move the world on with a public tick, at 4 to 6 Tgas a watch. Captains' wallets are sub-accounts with no key at all, so only the rules can move their money. Claims clear with an Eisenberg-Noe algorithm on-chain. Hidden facts, like a hull's condition, are not stored: they're drawn from block randomness the moment someone looks. Live NEAR Intents quotes set the roughness of the sea, so real markets change the game with no patch. Players start with a guest account or NEAR Auth, and never see a wallet, seed phrase or gas prompt. A public front-door key, limited by NEAR to one method, opens accounts without a server. Any AI agent can run a house through the public methods, and an example agent can use NEAR AI Cloud.
>
> The same Rust rules compile to the contract and to the browser, so practice mode and the week-in-a-minute fast-forward run the contract's real rules. In 900 bot-played seasons, signing everything failed more than half the time, while careful underwriting more than doubled the money.

## Demo video

A captioned, two-minute recording of the real game is at [`docs/demo/foul-weather-demo.mp4`](demo/foul-weather-demo.mp4). It has no sound, so the bells are missing. You can post it as it is, but your own voice and the bells would be better. A shorter script for that:

| Time | Show | Say |
| --- | --- | --- |
| 0:00 | The title screen | "Most game economies are shops. In this one, you don't trade the goods. You carry the risk." |
| 0:08 | Open a slip, press **Why?** | "This captain has their own wallet. They'll pay out of what the voyage should earn. Is that enough for this crossing?" |
| 0:20 | **Survey**, then sign | "The hull's real state didn't exist until I paid to look. On a public chain, that's the only way to keep a secret." |
| 0:32 | The ship crosses, then the bell | "Two bells: safe home. One bell: I'm paying." |
| 0:42 | `?demo=spiral` at the storm | "Here's what happens when everyone has passed risk to everyone else." |
| 0:55 | The Room's network as houses die, then the list | "One storm, five houses. Each one failed because the last one couldn't pay." |
| 1:08 | **Under the hood**: the live contract and a transaction | "There's no server. The contract runs the world, captains' wallets have no keys, and live NEAR Intents prices set the sea." |
| 1:18 | The game running | "It's live on testnet. Link below." |

## Demo post for X

> In most games, the economy is a shop. I built one where you don't trade goods, you insure them.
>
> Price a captain's voyage. Hear the bell. Then watch one storm take down five insurers, each failing because the last one couldn't pay.
>
> No server: on NEAR, captains' wallets have no keys, so only the rules can move their money, and live NEAR Intents prices set the sea.
>
> Built at NEAR HACKATHON. Would you sign this slip?
>
> [link to game] [link to repo]
>
> @NEARProtocol @NearLegion @NearBuilders #NEARHackathon

## Hosting

`.github/workflows/pages.yml` publishes the game to GitHub Pages on every push to `main`. Set **Settings > Pages > Source** to **GitHub Actions** once. The hackathon asks that a hosted demo stays up until at least 18 November, and ideally 25 November.

The hosted page plays practice mode and the live Room as a guest with no setup. Google and email sign-in needs a client id from NEAR Auth, in `VITE_FW_AUTH_CLIENT_ID`.

`.github/workflows/keeper.yml` keeps the live world moving while no one is playing. It needs one repository secret, `NEAR_PRIVATE_KEY`.
