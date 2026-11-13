// Everything the harbor says. Numbers come from the engine; the voice lives here.

import type { Captain, GameEvent, Reason, Slip, View } from "./types";

export const crowns = (n: number) => Math.round(n).toLocaleString("en-US");
export const pct = (bps: number, digits = 1) => `${(bps / 100).toFixed(digits)}%`;

export function when(watch: number, perDay: number) {
  const day = Math.floor(watch / perDay);
  return { day: day + 1, week: Math.floor(day / 7) + 1 };
}

const WATCH_NAMES = ["Middle", "Morning", "Forenoon", "Afternoon", "Dog", "First"];
export const watchName = (watch: number) => `${WATCH_NAMES[watch % 6]} watch`;

export function seaWord(sea: number) {
  if (sea >= 85) return "Tempest";
  if (sea >= 60) return "Gale";
  if (sea >= 42) return "Rough";
  if (sea >= 24) return "Moderate";
  return "Calm";
}

const VOICE: Record<number, { open: string; thin: string; cash: string }> = {
  0: { open: "I keep good books and I'd like to keep them.", thin: "It's a thin trip. I can't pretend otherwise.", cash: "Money's tight this month." },
  1: { open: "I've slept on this and I'm still going.", thin: "The numbers barely float.", cash: "I'm a little short, I'll admit." },
  2: { open: "You know who I am. Are you in or not?", thin: "There's not much in it, so don't get clever.", cash: "Don't ask about my accounts." },
  3: { open: "The figures favour this crossing.", thin: "The margin is poor this time.", cash: "My reserves are low." },
  4: { open: "Mon ami, this one sings.", thin: "A small voyage, but a pretty one.", cash: "Money comes and goes, chéri." },
  5: { open: "I'd rather be careful and dull.", thin: "It hardly covers the crew.", cash: "I count every coin twice as it is." },
  6: { open: "The sea owes me a favour.", thin: "It's a poor cargo, but I'm bored in port.", cash: "I'll be rich again by Thursday." },
  7: { open: "She's old, but so am I.", thin: "There's little in it. There never is.", cash: "Haven't seen a full purse since the war." },
  8: { open: "I have checked this four times.", thin: "The expected return is small.", cash: "Liquidity is lower than I like." },
  9: { open: "Tomorrow looks kind. I've asked.", thin: "It's a modest run.", cash: "It's been a lean month." },
  10: { open: "I'm sorry to trouble you. Again.", thin: "It won't make anyone's fortune.", cash: "I owe people. Not you. Yet." },
  11: { open: "Straight dealing, straight sailing.", thin: "It's fair, but it's small.", cash: "Cash is short for now." },
};

export function greeting(s: Slip) {
  return VOICE[s.captain]?.open ?? "Will you cover me?";
}

function reasonLine(r: Reason, s: Slip, captain: number) {
  const voice = VOICE[captain];
  switch (r.code) {
    case "profit":
      return r.value > 250
        ? `I expect to clear about ${crowns(r.value)} crowns on this.`
        : `${voice?.thin ?? "It is a thin trip."} About ${crowns(Math.max(r.value, 0))} crowns.`;
    case "gives_up_pct":
      return `I'll give up ${r.value}% of that for cover, and no more.`;
    case "dest_price_pct":
      return r.value >= 130
        ? `${cap(s.good_name)} fetches ${r.value}% of its usual price at the other end, because they're short of it.`
        : r.value <= 85
          ? `${cap(s.good_name)} is cheap over there at ${r.value}% of usual, so my margin is small.`
          : `${cap(s.good_name)} is at a normal price over there.`;
    case "short_of_cash":
      return `${voice?.cash ?? "Money is tight."} I have ${crowns(r.value)} crowns in hand.`;
    case "second_try":
      return "Nobody took this the first time, so I've raised my offer by a fifth.";
    case "lost_ships":
      return r.value === 1 ? "I've lost a ship before. I know what cover is for." : `I've lost ${r.value} ships. I know what cover is for.`;
    default:
      return "";
  }
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function offerReasons(s: Slip) {
  return s.reasons.map((r) => reasonLine(r, s, s.captain)).filter(Boolean);
}

export function priceReason(name: string, price: number, usual: number, stock: number, target: number) {
  const multiple = Math.round((price / usual) * 100);
  if (multiple >= 115) return `Merrow is short of ${name}: ${stock} in store against the ${target} it wants, so it pays ${multiple}% of the usual ${usual}.`;
  if (multiple <= 85) return `Merrow is flooded with ${name}: ${stock} in store against the ${target} it wants, so it pays only ${multiple}% of the usual ${usual}.`;
  return `Stock of ${name} is close to the ${target} Merrow wants, so the price sits near its usual ${usual}.`;
}

function captainOf(view: View, id: number): Captain | undefined {
  return view.captains[id];
}

function shipOf(view: View, id: number) {
  return captainOf(view, id)?.ship ?? "A ship";
}

function lanesText(view: View, mask: number) {
  const names = view.lanes.filter((l) => mask & (1 << l.id)).map((l) => l.name);
  if (names.length === view.lanes.length) return "every lane";
  return names.join(", ");
}

export interface Line {
  text: string;
  tone: "plain" | "good" | "bad" | "storm";
}

export function eventLine(e: GameEvent, view: View): Line | null {
  const house = (id: number) => view.houses[id]?.name ?? "A house";
  switch (e.type) {
    case "home":
      return { text: `${shipOf(view, e.captain)} home at ${view.ports[e.port]?.name}.`, tone: "plain" };
    case "wrecked":
      return {
        text: `${shipOf(view, e.captain)} lost on ${view.lanes[e.lane]?.name}${e.storm ? " in the storm" : ""}.${e.sum ? ` ${crowns(e.sum)} crowns claimed.` : " She sailed uninsured."}`,
        tone: "bad",
      };
    case "claim_paid":
      if (e.sum === 0) return { text: `The cover on ${shipOf(view, e.captain)} died with its house. Nothing was paid.`, tone: "bad" };
      return e.paid >= e.sum
        ? { text: `Claim on ${shipOf(view, e.captain)} paid in full: ${crowns(e.paid)}.`, tone: "plain" }
        : { text: `Claim on ${shipOf(view, e.captain)} paid short: ${crowns(e.paid)} of ${crowns(e.sum)}.`, tone: "bad" };
    case "house_failed":
      return { text: `${house(e.house)} is struck from the register, ${crowns(e.owed - e.paid)} crowns short.`, tone: "bad" };
    case "founded":
      return { text: `${house(e.house)} opens for business in the Room.`, tone: "plain" };
    case "laid_up":
      return { text: `${captainOf(view, e.captain)?.name} is laid up, out of money.`, tone: "bad" };
    case "refitted":
      return { text: `${house(e.house)} refits ${shipOf(view, e.captain)}.`, tone: "good" };
    case "glass":
      return {
        text: e.great
          ? `The glass is falling fast. A great storm is coming to ${lanesText(view, e.lanes)}.`
          : `The glass is falling on ${lanesText(view, e.lanes)}.`,
        tone: "storm",
      };
    case "storm_hit":
      return { text: `${e.great ? "The great storm" : "A squall"} breaks over ${lanesText(view, e.lanes)}.`, tone: "storm" };
    case "ceded":
      return { text: `${house(e.from)} passes ${crowns(e.sum)} of risk to ${house(e.to)}.`, tone: "plain" };
    case "fraud":
      return { text: `Inquiry: ${captainOf(view, e.captain)?.name} scuttled the ship. Claim void.`, tone: "good" };
    case "honest_loss":
      return { text: `Inquiry: ${captainOf(view, e.captain)?.name} was honest. ${house(e.house)} looks foolish.`, tone: "plain" };
    case "withdrew":
      return { text: `${captainOf(view, e.captain)?.name} found no cover and stays in port.`, tone: "plain" };
    case "sailed_bare":
      return null;
    case "season_end":
      return { text: `The season closes.`, tone: "storm" };
    default:
      return null;
  }
}

export function titleFor(capital: number) {
  if (capital <= 0) return "Shop closed";
  if (capital < 4000) return "Little Shop";
  if (capital < 7000) return "Busy Shop";
  if (capital < 11000) return "Famous Shop";
  if (capital < 16000) return "Harbor Hero";
  return "Harbor Champion";
}

/** Very long account names, such as 64-character implicit ones, shortened to fit a button. */
export function shortAccount(id: string) {
  return id.length > 40 ? `${id.slice(0, 10)}…${id.slice(-8)}` : id;
}
