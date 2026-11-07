# The game loop on paper

Foul Weather is a marine insurance game. You don't trade goods. You price the risk of other people's voyages, and the economy reacts to your prices.

## Every 30 seconds

A captain asks for cover. You read their slip:

- what they will pay, and why (press **Why?**)
- the likely risk of the crossing, shown as a range
- how sound the ship is said to be, and what the harbor says about the captain
- what the Room has already signed

Then you pick a line (25%, 50% or 100%) and a rate, and sign. Or you pay a surveyor to find the real state of the hull, or you pass. If you sign, you are paid at once. If the ship is lost, you pay out your line.

Thirty seconds later you hear a bell. Two strokes: safe home, keep the premium. One stroke: she's gone.

## Every 5 minutes

Something forces a decision bigger than one slip:

- **The glass falls.** A storm is forecast. You have a few watches to lay risk off onto other houses before they notice too.
- **A claim comes due.** You have three watches to find the money, or to hold an inquiry if the wreck smells wrong.
- **A house offers you premium** to carry its risk. It's easy money until a storm, and you can't see who else it has passed risk to.
- **A captain goes broke.** You can refit them and be repaid from future voyages, if they survive.

## Every session

A season is four weeks, about 12 minutes at normal speed. You start with 4,000 crowns. You try to end the season alive and on top of the Room. Two great storms arrive in every season. Each one can bring houses down, and a failed house takes its reinsurance promises with it.

## Why the economy is the game

Nothing is priced from a table. Captains offer a share of what a voyage should earn. Houses price what they think the risk is. Those two views collide on every slip:

1. High premiums keep captains in port.
2. Fewer voyages mean goods run short in Merrow, and prices rise.
3. Higher prices mean fatter margins, so captains can pay more.
4. Rich premiums pull new money into the Room, and rates fall again.
5. A storm wipes out capital, houses get scared, and rates rise.

That is the real insurance cycle, and no one scripted it. It comes out of `crates/core/src/rules.rs`.

## What 900 simulated seasons show

Run this yourself with `cargo run --release -p foul-core --example balance -- 300`.

| Style of play | Houses that fail | Median final capital | Top 10% finish at |
| --- | --- | --- | --- |
| Signs 100% of everything | 72% | 0 | 9,615 |
| Signs 50% of everything | 54% | 0 | 11,778 |
| Careful: prices risk, avoids storms, lays off | 8% | 9,792 | 14,389 |

Each starts with 4,000 crowns. Figures are from 300 seasons per style, played by scripted bots, not people.
