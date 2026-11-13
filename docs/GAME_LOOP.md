# The game loop on paper

Foul Weather is a town-builder where every trip is a gamble. Under the cartoon is a real market, and other people can help you or rob you.

## Every few seconds

A ship is at sea. The coin counter climbs each watch, and so does the danger. Two numbers are on the card: what you keep if you come home now, and what the chest at the island is worth. The waves on each route change every watch, and the word on the water tells you what's coming next: Calm, Choppy, Rough or WILD.

**Tap Come home!** to bank it, or hold on.

## Every 30 seconds

The ship gets there, comes home or sinks.

- **It gets there:** a treasure chest to open. Most hold the cargo's full value, and some hold up to five times as much. Chests in a row add to your pay.
- **You called it home:** you keep what it was worth at that moment, between 20% and 91% of the full value.
- **It sank:** the cargo is gone, your run of chests ends, and the ship is out for a little while. If you paid for protection, whoever protected you pays out.

Sometimes something happens on the way: a floating crate, pirates, or a shortcut through bad water. You choose quickly.

## Every few minutes

You spend what you've won, and the town on your land grows.

| Spend on | What it does |
| --- | --- |
| Cottages, stalls, bakeries, inns, a market hall | Earn coins while you do something else. Tap the gold to collect. |
| Docks and bigger ships | Carry more, on more routes at once. |
| Deckhands, lookouts, navigators, merchants | More pay, safer trips, quicker trips. |
| Warehouse, lighthouse, shipyard | Store more coins, make every trip safer, fix ships faster. |
| Pirate Cove | Raid other people's ships. |
| Insurance Office | Other players pay you to protect their trips. |

A card always shows the next thing worth saving for. Levels unlock further islands and better things to buy.

## Every session

A season is 168 watches, about 10 minutes in practice. It ends at the Harbor Festival, where the three richest towns win prizes. Your coins, ships and buildings carry on to the next season. Nothing punishes stepping away: income waits for you up to a limit, and wrecked ships fix themselves.

## Playing with other people

Everything below is on the same testnet contract, between real accounts.

| Action | Effect | Limit |
| --- | --- | --- |
| Talk | Type up to 120 characters, or tap a phrase, to everyone or to one town. Shown in Harbor talk and over your ship. | 3 lines a watch. Links, contact details and common swear words are refused. Anyone can be muted. |
| Help a town | You each earn `25 + 10 x level` coins and 15 experience. | Once every 8 watches. Real players only. |
| Send a gift | Up to 100 of your coins go to their account. | Once every 8 watches. Real players only. |
| Sail together | While another real player sails your route, danger is 65% of normal for you both. | Rival towns run by the game don't count. |
| Protect each other | A real player's Insurance Office is chosen first if its price is within about 15% of the cheapest shop. | The office must hold twice the cover. |
| Raid | 40 coins sends pirates. If they win they take 25% of the cargo's value so far. | The owner sees a warning and has two watches to run. 8-watch rest between raids. |

Rival towns run by the rules race you, chat, and answer when a person speaks, so one player still has a busy sea. They are tagged **bot** wherever they appear, so nobody mistakes them for people.

## Why no simple habit always wins

Run this yourself with `cargo run --release -p foul-core --example town_styles -- 150`.

Each bot spends the same way, on whatever the game suggests next, so only its sailing differs. Figures are from 150 seasons per style, played by scripted bots, not people. The table has one human-style player and five rival towns.

| Style of sailing | Median worth | Unlucky 10% | Lucky 10% | Trips sunk | Finishes |
| --- | --- | --- | --- | --- | --- |
| Timid, always leaves early | 973 | 821 | 1,434 | 18% | 5th of 6 |
| Always home halfway | 939 | 797 | 1,261 | 18% | 5th |
| Casual, any island, sometimes comes home | 2,051 | 967 | 3,964 | 17% | 3rd |
| Always the furthest, never stops | 2,157 | 840 | 4,294 | 38% | 3rd |
| Always the nearest, never stops | 2,172 | 1,169 | 3,958 | 20% | 3rd |
| Reads the sea, leaves when it turns bad | 2,399 | 1,295 | 3,935 | 17% | 2nd |
| Runs only from wild water | 2,827 | 1,041 | 5,226 | 18% | 2nd |
| Patient: waits for good water, then runs from wild | 4,116 | 2,515 | 7,906 | 11% | 1st |

Never risking anything finishes near the bottom. Pushing on blindly sinks more than a third of its trips. Reading the water is worth about twice as much as ignoring it, and even the best style still loses about three ships a season. Skill pays, and luck never goes away.

## Underneath: a real insurance market

Protection is bought from the harbor's shops. Those same shops insure a fleet of animal captains, and they pass risk to each other through reinsurance. **More ways to play** on the title screen lets a person run a shop or steer a captain.

Nothing is priced from a table:

1. High fees keep captains in port.
2. Fewer voyages mean goods run short in Merrow Town, and prices rise. What your ships deliver pushes prices back down.
3. Higher prices mean fatter margins, so captains can pay more.
4. Rich fees pull new money into the shops, and fees fall again.
5. A storm wipes out coins, shops get scared, and fees rise.

That is the real insurance cycle, and no one scripted it. It comes out of `crates/core/src/rules.rs`.

In a great storm, shops that all passed their risk to each other can fall in a chain. **Watch a spiral collapse** shows one.

### Running a shop: what the bots show

On the simple yes-or-no card:

| Style of play | Shops that close | Median final coins | Ships lost in a season |
| --- | --- | --- | --- |
| Says yes to green deals only | 1% | 6,346 | 2.8 |
| Says yes to green and gold deals | 1% | 5,840 | 3.5 |
| Says yes to everything | 10% | 2,921 | 5.8 |

So the meter tells the truth. Each starts with 4,000 coins and sees 80% of the captains. Figures are from 300 seasons per style, played by scripted bots, not people.

With every control, run `cargo run --release -p foul-core --example balance -- 300`:

| Style of play | Shops that close | Median final coins | Top 10% finish at |
| --- | --- | --- | --- |
| Takes 100% of everything | 69% | 0 | 10,520 |
| Takes 50% of everything | 50% | 0 | 11,148 |
| Careful: prices risk, avoids storms, shares danger | 8% | 9,978 | 14,580 |

Each starts with 4,000 coins. Figures are from 300 seasons per style, played by scripted bots, not people.
