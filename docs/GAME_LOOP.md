# The game loop on paper

Foul Weather looks like a sunny harbor game. Under the cartoon is a real marine insurance market. You don't trade goods. You protect other people's voyages, and the economy reacts to what you do.

## Every 15 seconds

A captain comes to your dock and asks you to protect their ship. The card tells you three things:

- **You get now:** the coins they pay you, straight away.
- **If it sinks:** the coins you pay if the ship is lost.
- **The meter:** green is a great deal, gold could go either way, and red means the pay is too small for the danger. **Why?** explains it in a sentence.

You tap yes or no. If you say yes and the ship sails, the coins fly to your counter and the ship gets a gold ring on the map.

## Every 30 seconds

You hear a bell. Two strokes: the ship is safe home, and there's a star to tap. One stroke: a cartoon shipwreck, and a bill.

## Every few minutes

Something bigger happens. Pip the parrot brings each of these in only when you are ready, one level at a time:

| Level | New skill | What it does |
| --- | --- | --- |
| 2 | Share the danger | A storm is coming. Pay a rival shop to help if your ship sinks, before they notice too. |
| 3 | Ship inspector | Pay a few coins to find out if a ship is strong or falling apart. |
| 4 | Detective | A wreck looks odd. Investigate, and you don't pay if the captain sank it on purpose. |
| 5 | Helping hand | Lend coins to a broke captain, and be repaid from later trips. |

Quests give you one clear goal at a time. Stars from quests and safe ships buy decorations for your harbor. All of this stays on your device and never touches the economy.

## Every session

A season is four weeks, about 18 minutes at normal speed. You start with 4,000 coins. You try to reach the Harbor Festival with your shop open and on top of **Who's winning?**. Two great storms arrive in every season. Each one can close shops, and a closed shop takes its promises with it.

## Why the economy is the game

Nothing is priced from a table. Captains offer a share of what a voyage should earn. Shops price what they think the risk is. Those two views meet on every deal:

1. High fees keep captains in port.
2. Fewer voyages mean goods run short in Merrow Town, and prices rise.
3. Higher prices mean fatter margins, so captains can pay more.
4. Rich fees pull new money into the shops, and fees fall again.
5. A storm wipes out coins, shops get scared, and fees rise.

That is the real insurance cycle, and no one scripted it. It comes out of `crates/core/src/rules.rs`.

## Two ways to play it

The yes-or-no card is a friendly way to use the real rules. Each yes is a real quote. The client takes a share of the ship small enough that one wreck costs about a quarter of your coins, so a beginner can't lose everything to bad luck, and deals grow as the shop grows.

**For grown-ups** opens the whole market: positions, reinsurance offers, who relies on whom, goods prices and the live contract.

## What the bots show

### On the yes-or-no screen

| Style of play | Shops that close | Median final coins | Ships lost in a season |
| --- | --- | --- | --- |
| Says yes to green deals only | 1% | 6,377 | 2.8 |
| Says yes to green and gold deals | 2% | 6,132 | 3.4 |
| Says yes to everything | 8% | 3,535 | 5.5 |

So the meter tells the truth. Choosing grows your shop, and saying yes to everything shrinks it, without one bad storm ending a child's game.

Each starts with 4,000 coins and sees 80% of the captains. Figures are from 300 seasons per style, using the same logic as the card, played by scripted bots, not people. The bots use none of the level skills.

### With every control

Run this yourself with `cargo run --release -p foul-core --example balance -- 300`.

| Style of play | Shops that close | Median final coins | Top 10% finish at |
| --- | --- | --- | --- |
| Takes 100% of everything | 72% | 0 | 9,615 |
| Takes 50% of everything | 54% | 0 | 11,778 |
| Careful: prices risk, avoids storms, shares danger | 8% | 9,792 | 14,389 |

Each starts with 4,000 coins. Figures are from 300 seasons per style, played by scripted bots, not people.
