// A guided tour in which Pip plays the real game and explains it aloud.
// It presses the same buttons a player would, so everything on screen is genuine,
// and the last part happens on NEAR testnet. The world holds still while Pip talks,
// so the words always match what you can see.

import * as sound from "./audio";
import lines from "./pipLines.json";

type LineId = keyof typeof lines;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
let stopped = false;

/** How fast the world runs while Pip is playing, and during the skip ahead. */
const TOUR_WATCH_MS = 1500;
const SKIP_WATCH_MS = 300;

/** Lets the tour hold the practice world still while Pip explains something. */
export const tourStage: { pace: ((ms: number) => void) | null } = { pace: null };

function caption(text: string) {
  let el = document.getElementById("tour-caption");
  if (!el) {
    el = document.createElement("div");
    el.id = "tour-caption";
    el.setAttribute("role", "status");
    const pip = document.querySelector("svg.pip")?.cloneNode(true) as SVGElement | undefined;
    if (pip) {
      pip.setAttribute("width", "62");
      pip.setAttribute("height", "62");
      el.appendChild(pip);
    }
    el.appendChild(document.createElement("span"));
    document.body.appendChild(el);
  }
  el.lastElementChild!.textContent = text;
  el.hidden = !text;
}

/** Shows a line and speaks it, then waits for it to finish. */
async function say(id: LineId) {
  if (stopped) throw new Error("tour stopped");
  const { text } = lines[id];
  caption(text);
  if (!(await sound.speak(id))) await sleep(600 + text.split(" ").length * 340);
  await sleep(260);
}

const one = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector);

function byText(selector: string, text: string) {
  return [...document.querySelectorAll<HTMLElement>(selector)].find((el) => el.textContent?.includes(text)) ?? null;
}

async function waitFor<T extends Element>(find: () => T | null | undefined, timeout = 30000): Promise<T | null> {
  const start = performance.now();
  while (performance.now() - start < timeout) {
    if (stopped) throw new Error("tour stopped");
    // A level-up never holds the tour up.
    one('[aria-label="Level up"] .big-button')?.click();
    const found = find();
    if (found) return found;
    await sleep(120);
  }
  return null;
}

/** The world holds still while Pip explains, then carries on. */
async function talk(id: LineId) {
  tourStage.pace?.(0);
  await say(id);
  tourStage.pace?.(TOUR_WATCH_MS);
}

function setValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

async function openTab(name: string) {
  (await waitFor(() => byText(".tabs button", name), 8000))?.click();
  await sleep(250);
}

/** The furthest open island that isn't wild right now. */
function chooseIsland() {
  const rows = [...document.querySelectorAll<HTMLElement>(".route-row:not([disabled])")].reverse();
  return rows.find((row) => !/wild|storm/i.test(row.textContent ?? "")) ?? rows[rows.length - 1] ?? null;
}

/** Watches a trip to its end, and says what happened. */
async function watchTrip() {
  let surprised = false;
  let warned = false;
  for (let turn = 0; turn < 10; turn++) {
    const event = await waitFor(
      () => one(".chest-back") ?? one(".theatre.wreck") ?? (surprised ? null : one(".surprise")) ?? (warned ? null : one(".come-home.urgent")),
      45000,
    );
    if (!event) return;
    if (event.matches(".chest-back")) {
      await say("tchest");
      const pop = one(".chest-pop");
      if (pop && !pop.classList.contains("open")) pop.click();
      await sleep(2000);
      one(".chest-pop")?.click();
      await sleep(500);
      return;
    }
    if (event.matches(".theatre")) {
      await sleep(2200);
      await say("tsink");
      one(".theatre")?.click();
      await sleep(500);
      return;
    }
    if (event.matches(".surprise")) {
      surprised = true;
      await talk("tsurprise");
      one(".surprise .yes")?.click();
      await sleep(400);
      continue;
    }
    warned = true;
    await talk("twild");
    one(".come-home")?.click();
    await waitFor(() => byText(".toast", "Safe home"), 6000);
    await sleep(500);
    await talk("tkept");
    return;
  }
}

async function townRound() {
  const name = await waitFor(() => one<HTMLInputElement>("#house"), 2000);
  if (name) setValue(name, "Pip's Harbor");
  await say("v1");
  (byText("button", "Play!") ?? byText("button", "Carry on!"))?.click();
  const sail = await waitFor(() => one(".sail-now:not([disabled])"), 15000);
  tourStage.pace?.(0);
  await sleep(600);
  await say("v2");
  sail?.click();
  await waitFor(() => one(".route-row:not([disabled])"), 5000);
  await sleep(300);
  await say("v3");
  chooseIsland()?.click();
  await waitFor(() => one(".come-home"), 5000);
  await sleep(400);
  await say("v4");
  await say("v5");
  tourStage.pace?.(TOUR_WATCH_MS);
  await watchTrip();

  // A first thing to buy.
  await waitFor(() => (one(".chest-back") || one(".theatre") ? null : one(".town-nav")), 6000);
  tourStage.pace?.(0);
  await say("v6");
  one('[data-sheet="build"]')?.click();
  const cottage = await waitFor(() => one('[data-buy="Cottage"]:not([disabled])'), 2500);
  await sleep(700);
  cottage?.click();
  await sleep(1000);
  one(".sheet-close")?.click();
  await sleep(700);
}

/** Pip plays quickly for a while, the way someone would over a longer game. */
async function skipAhead(ms: number) {
  await say("v7");
  tourStage.pace?.(SKIP_WATCH_MS);
  const end = performance.now() + ms;
  while (performance.now() < end) {
    if (stopped) throw new Error("tour stopped");
    one('[aria-label="Level up"] .big-button')?.click();
    one(".chest-pop")?.click();
    one(".theatre")?.click();
    one(".goal-card.ready:not(:disabled)")?.click();
    one("[data-collect]")?.click();
    one(".surprise .no")?.click();
    for (const box of document.querySelectorAll<HTMLElement>('.at-sea[data-state="wild"]')) box.querySelector<HTMLElement>(".come-home")?.click();
    const sailing = one(".sail-now:not([disabled])");
    if (sailing) {
      sailing.click();
      await sleep(60);
      chooseIsland()?.click();
    }
    await sleep(150);
  }
  tourStage.pace?.(0);
  one(".chest-pop")?.click();
  await sleep(400);
  await waitFor(() => (one(".chest-back") ? (one(".chest-pop")?.click(), null) : one(".town-nav")), 3000);
  await say("v8");
}

/** Behind the town: the shops that insure the ships, and how they can all fall together. */
async function spiral() {
  await say("v9");
  one(".grown-ups")?.click();
  await openTab("Under the hood");
  byText("button", "Watch a spiral collapse")?.click();
  await waitFor(() => one(".race.wide"), 8000);
  await sleep(500);
  await talk("spiral1");
  await waitFor(() => one(".race.wide li.closed"), 40000);
  await talk("fall");
  await waitFor(() => one(".modal .dominoes"), 60000);
  await sleep(1900);
  await say("gone1");
  await say("gone2");
  byText(".modal button", "Open your own shop")?.click();
}

async function liveRound() {
  const name = await waitFor(() => one<HTMLInputElement>("#house"), 8000);
  if (name) setValue(name, "Pip's Harbor");
  await sleep(300);
  byText("button", "Play with others")?.click();
  await say("live1");
  await waitFor(() => one(".fleet-card"), 60000);
  await sleep(600);
  await say("v11");

  const input = await waitFor(() => one<HTMLInputElement>("[data-chat-input]"), 5000);
  await say("v12");
  if (input) setValue(input, "Ahoy everyone! Pip here.");
  await sleep(500);
  one("[data-chat-send]")?.click();
  await waitFor(() => byText(".talk li.you", "Pip here"), 25000);
  await sleep(600);
  await say("v13");

  one('[data-sheet="towns"]')?.click();
  await sleep(800);
  await say("v14");
  await say("v15");
  one(".sheet-close")?.click();
  await sleep(300);

  one(".grown-ups")?.click();
  await openTab("Under the hood");
  await waitFor(() => byText(".hood dt", "Last action"), 20000);
  await say("v16");
  await say("live4");
  one(".drawer-close")?.click();
  await say("vend");
  await sleep(1500);
}

export async function runTour() {
  stopped = false;
  document.body.classList.add("touring");
  const stop = () => {
    stopped = true;
    sound.stopVoice();
  };
  window.addEventListener("keydown", (e) => e.key === "Escape" && stop(), { once: true });
  try {
    await townRound();
    await skipAhead(30000);
    await spiral();
    await liveRound();
  } catch {
    // Stopping the tour leaves the game exactly where it was.
  } finally {
    caption("");
    document.body.classList.remove("touring");
  }
}
