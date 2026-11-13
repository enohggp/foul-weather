# Submission kit

Everything here is a draft for the team to check and send. Nothing has been posted or submitted.

## Before you submit

- [ ] The repository is public: <https://github.com/enohggp/foul-weather>.
- [ ] A demo post is live on X, with a video or screenshots attached.
- [ ] You have a mainnet NEAR account for the payout.
- [ ] Both tracks below are right for you.
- [ ] Nothing secret is in the repository history.
- [ ] You submit before 14 November 2026, 23:59 UTC. There is one attempt.

## Fields for the form

| Field | Value |
| --- | --- |
| Project name | Foul Weather |
| Tracks | `games`, `agents` |
| What they built | See below. It is under the 2,000 character limit. |

These you need to fill in yourself: team lead's name, contact email, team size, NEAR payout account, repository link, demo post link, and the consent notice.

### What they built

> Most game economies are a price table with a shop on top, so the same safe moves always win and nothing players do really matters. Foul Weather is a bright town-builder where every trip is a gamble: send a ship out, watch its cargo and its danger climb, then come home in time or risk it all for treasure. Real players share one sea, where they chat, help each other's towns, send gifts and raid each other's ships, while animal captains with their own wallets trade and insure each other in a market that can collapse in a chain. NEAR runs the whole world with no game server: one contract holds the rules and every coin, ship and insurance policy as NEP-245 tokens, the captains' wallets are sub-accounts with no keys so only the rules can move their money, and live NEAR Intents quotes set how rough the sea is. Players start as a guest with nothing to set up, or connect their own testnet wallet through NEAR Connect, and can share their town on near.social.

## Demo video

The film to post is [`docs/demo/foul-weather-film.mp4`](demo/foul-weather-film.mp4). It runs 2 minutes 8 seconds, which fits a free X account's limit of 2 minutes 20. It opens on one boat and one choice, plays a full moment from tap to result, and explains what NEAR does in plain words. It deliberately doesn't mention the hackathon, so the post has to say that.

How it was made:

- Everything on screen is the real game. The practice scenes were filmed frame by frame from the real page, and some are sped up.
- The two players are real testnet accounts on the live contract, driven by a script. A note on screen says so.
- The transactions listed near the end are real, and each was confirmed on the chain before going in the film.
- The captains' wallets shown have no access keys, also checked on-chain.
- The great storm was started with the practice button. Who fell, and in what order, came from the rules.
- The narrator and both players are AI voices. See [`AI_AND_LIBRARIES.md`](AI_AND_LIBRARIES.md).

If you would rather talk over a shorter cut yourself, here is a script:

| Time | Show | Say |
| --- | --- | --- |
| 0:00 | The title screen | "This is a town-builder where every trip is a gamble, and the whole economy runs on NEAR." |
| 0:06 | Tap Sail, pick an island | "I send my boat out. The further the island, the more it pays." |
| 0:14 | Coins climbing, the danger bar | "The cargo's worth more every few seconds. So I can come home and keep it, or hold on for a chest and risk the lot." |
| 0:26 | A chest opening, or a wreck | "Sometimes treasure. Sometimes not." |
| 0:34 | Build, and the town growing | "I spend it on buildings, ships and crew, and race other towns." |
| 0:44 | **Play with others**: two browsers, typing to each other | "Online, these are real people. We can talk, help each other's towns, send gifts, and raid each other's ships." |
| 0:58 | `?demo=spiral` at the storm | "Underneath is a real insurance market. One storm, and the shops fall in a chain." |
| 1:10 | **For grown-ups**: the live contract and a transaction | "There's no server. One contract runs the world, and the game never asked for a single NEAR token." |
| 1:20 | The game running | "It's live on testnet. Link below." |

## Demo post for X

Attach [`docs/demo/foul-weather-film.mp4`](demo/foul-weather-film.mp4) to the first post. It is 271 of the 280 characters a free account allows, counting the link as 23.

> Would you bank your cargo, or risk it all for treasure? ⛵
>
> Foul Weather is a town-builder where real players help and raid each other on one sea. No server: one NEAR contract runs the economy.
>
> Built at NEAR HACKATHON @NEARProtocol #NEARHackathon
> https://github.com/enohggp/foul-weather

Optional reply, once GitHub Pages is on (259 characters):

> Play it free in your browser: https://enohggp.github.io/foul-weather/
>
> Start as a guest, or connect a testnet wallet. Every coin and ship is a token in one contract, and the captains have wallets with no keys, so only the rules can move their money. @NearLegion @NearBuilders

## Hosting

`.github/workflows/pages.yml` publishes the game to GitHub Pages on every push to `main`. Set **Settings > Pages > Source** to **GitHub Actions** once. The hackathon asks that a hosted demo stays up until at least 18 November, and ideally 25 November.

The hosted page plays practice mode and the live town as a guest with no setup. Google and email sign-in needs a client id from NEAR Auth, in `VITE_FW_AUTH_CLIENT_ID`.

`.github/workflows/keeper.yml` keeps the live world moving while no one is playing. It runs only when started from the **Actions** tab, needs one repository secret, `NEAR_PRIVATE_KEY`, and each run spends some of the contract's testnet NEAR.
