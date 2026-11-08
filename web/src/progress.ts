// Levels, quests and things to build. This lives on the player's device and has
// no effect on the economy: it is how a beginner learns the game one idea at a time.

export interface Progress {
  xp: number;
  stars: number;
  built: string[];
  doneQuests: string[];
  counts: Record<string, number>;
  taught: boolean;
}

const KEY = "fw-progress-1";

/** The guided tour plays a fresh game and leaves the player's own progress alone. */
const touring = () => document.body.classList.contains("touring");

export function loadProgress(): Progress {
  const empty: Progress = { xp: 0, stars: 0, built: [], doneQuests: [], counts: {}, taught: false };
  if (touring()) return empty;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...empty, ...(JSON.parse(raw) as Partial<Progress>) } : empty;
  } catch {
    return empty;
  }
}

export function saveProgress(p: Progress) {
  if (touring()) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // A private window may refuse storage. Progress then lasts as long as the tab.
  }
}

/** XP needed to finish a level. */
const toNext = (level: number) => 60 + level * 60;

export function levelOf(xp: number) {
  let level = 1;
  let left = xp;
  while (left >= toNext(level)) {
    left -= toNext(level);
    level += 1;
  }
  return { level, into: left, need: toNext(level) };
}

/** New skills, one per level, so nobody has to learn everything at once. */
export const UNLOCKS: Record<number, { name: string; text: string }> = {
  2: { name: "Share the danger", text: "When a storm is coming, pay a rival shop to help if your ship sinks." },
  3: { name: "Ship inspector", text: "Pay a few coins to see if a ship is strong or falling apart." },
  4: { name: "Detective", text: "Some sneaky captains sink their own ship for the money. Catch them!" },
  5: { name: "Helping hand", text: "Help a captain who has run out of coins. They'll pay you back." },
};

export const unlocked = (xp: number, level: number) => levelOf(xp).level >= level;
export const SKILL = { share: 2, inspector: 3, detective: 4, helper: 5 };

export interface Quest {
  id: string;
  text: string;
  count: string;
  target: number;
  stars: number;
}

export const QUESTS: Quest[] = [
  { id: "first", text: "Protect your first ship", count: "protected", target: 1, stars: 3 },
  { id: "collect", text: "Collect a reward from a safe ship", count: "collected", target: 1, stars: 3 },
  { id: "no", text: "Say NO to a dangerous ship", count: "refusedBad", target: 1, stars: 3 },
  { id: "three", text: "Protect 5 ships", count: "protected", target: 5, stars: 5 },
  { id: "coins5", text: "Have 5,000 coins", count: "coins", target: 5000, stars: 5 },
  { id: "share", text: "Share the danger before a storm", count: "shared", target: 1, stars: 5 },
  { id: "inspect", text: "Send an inspector to a ship", count: "inspected", target: 1, stars: 5 },
  { id: "home10", text: "Bring 10 ships home safe", count: "collected", target: 10, stars: 8 },
  { id: "coins8", text: "Have 8,000 coins", count: "coins", target: 8000, stars: 8 },
  { id: "detect", text: "Investigate a strange shipwreck", count: "investigated", target: 1, stars: 8 },
  { id: "help", text: "Help a captain who ran out of coins", count: "helped", target: 1, stars: 8 },
  { id: "season", text: "Reach the Harbor Festival with your shop open", count: "seasons", target: 1, stars: 15 },
];

/** A captain's goals. Earnings count from the moment the player took the wheel. */
export const CAPTAIN_QUESTS: Quest[] = [
  { id: "cap-first", text: "Finish your first trip", count: "trips", target: 1, stars: 3 },
  { id: "cap-shield", text: "Sail with a shop protecting you", count: "protectedTrips", target: 1, stars: 3 },
  { id: "cap-five", text: "Finish 5 trips", count: "trips", target: 5, stars: 5 },
  { id: "cap-earn1", text: "Earn 1,000 coins as captain", count: "earned", target: 1000, stars: 5 },
  { id: "cap-ten", text: "Finish 10 trips", count: "trips", target: 10, stars: 8 },
  { id: "cap-earn3", text: "Earn 3,000 coins as captain", count: "earned", target: 3000, stars: 8 },
];

export interface Build {
  id: string;
  name: string;
  stars: number;
}

export const BUILDS: Build[] = [
  { id: "flags", name: "Party flags", stars: 5 },
  { id: "flowers", name: "Flower garden", stars: 10 },
  { id: "fountain", name: "Fountain", stars: 20 },
  { id: "statue", name: "Parrot statue", stars: 35 },
  { id: "wheel", name: "Big wheel", stars: 60 },
];
