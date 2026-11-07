// A guided tour in which Pip plays the real game and explains it aloud.
// It presses the same buttons a player would, so everything on screen is genuine,
// and the last part makes a real move on NEAR testnet. The world holds still while
// Pip talks, so the words always match what you can see.

import * as sound from "./audio";
import lines from "./pipLines.json";

type LineId = keyof typeof lines;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
let stopped = false;

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

const one = <T extends Element = HTMLElement>(selector: string) => document.querySelector<T>(selector);

function byText(selector: string, text: string) {
  return [...document.querySelectorAll<HTMLElement>(selector)].find((el) => el.textContent?.includes(text)) ?? null;
}

async function waitFor<T extends Element>(find: () => T | null | undefined, timeout = 30000): Promise<T | null> {
  const start = performance.now();
  while (performance.now() - start < timeout) {
    if (stopped) throw new Error("tour stopped");
    // A level-up or a story moment never holds the tour up.
    one(".modal .confetti")?.parentElement?.querySelector<HTMLElement>(".big-button")?.click();
    const found = find();
    if (found) return found;
    await sleep(120);
  }
  return null;
}

/** The world holds still while Pip explains, then carries on quickly. */
async function talk(id: LineId) {
  one('[aria-label="Pause"]')?.click();
  await say(id);
  one('[aria-label="Fast"]')?.click();
}

function setName(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

async function openTab(name: string) {
  (await waitFor(() => byText(".tabs button", name), 8000))?.click();
  await sleep(250);
}

/** Pip's lesson moves on to the next highlight. */
async function nextStep() {
  one(".helper-yes")?.click();
  await sleep(350);
}

async function practiceRound() {
  const name = await waitFor(() => one<HTMLInputElement>("#house"));
  if (name) setName(name, "Pip's Shop");
  await say("intro1");
  await say("intro2");
  byText("button", "Play!")?.click();
  await waitFor(() => one(".yes"), 15000);
  await sleep(700);
  await say("card");
  await nextStep();
  await say("earn");
  await nextStep();
  await say("lose");
  await nextStep();
  await say("meter");
  await nextStep();
  await say("yes");
  await waitFor(() => one<HTMLButtonElement>(".yes:not([disabled])"), 2000);
  one(".yes")?.click();
  await sleep(500);
  one('[aria-label="Fast"]')?.click();

  // Keep taking good deals, the way a player would, until one of them sails.
  const takeGoodDeals = () => one<HTMLButtonElement>(".v-great .yes:not([disabled])")?.click();
  const sailed = await waitFor(() => {
    takeGoodDeals();
    return byText(".toast", "set sail");
  }, 30000);
  if (sailed) await talk("sailed");
  else await talk("waiting");

  const outcome = await waitFor(() => {
    takeGoodDeals();
    return one(".reward, .theatre.wreck");
  }, 45000);
  if (outcome?.classList.contains("reward")) {
    await waitFor(() => (one(".theatre") ? null : one(".reward")), 8000);
    await talk("home");
    one(".reward")?.click();
  } else if (outcome) {
    await sleep(3200);
    await talk("lost");
  } else {
    await talk("waiting");
  }
  await sleep(900);
}

async function spiral() {
  await waitFor(() => (one(".theatre") ? null : one(".grown-ups")), 9000);
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
  if (name) setName(name, "Pip's Shop");
  await sleep(300);
  byText("button", "Play with others")?.click();
  await say("live1");
  await waitFor(() => one(".pill.coins"), 45000);
  await sleep(500);
  await say("live2");
  const yes = await waitFor(() => one<HTMLButtonElement>(".yes:not([disabled])"), 40000);
  yes?.click();
  await sleep(300);
  one(".grown-ups")?.click();
  await openTab("Under the hood");
  await waitFor(() => byText(".hood dt", "Last action"), 20000);
  await say("live3");
  await say("live4");
  one(".drawer-close")?.click();
  await say("end");
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
    await practiceRound();
    await spiral();
    await liveRound();
  } catch {
    // Stopping the tour leaves the game exactly where it was.
  } finally {
    caption("");
    document.body.classList.remove("touring");
  }
}
