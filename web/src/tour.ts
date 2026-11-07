// A guided tour that plays the real game by itself and explains it aloud.
// It clicks the same buttons a player would, so everything on screen is genuine,
// and the last part makes a real move on NEAR testnet.

import lines from "./tourLines.json";

type LineId = keyof typeof lines;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
let stopped = false;
let currentAudio: HTMLAudioElement | null = null;

function caption(text: string) {
  let el = document.getElementById("tour-caption");
  if (!el) {
    el = document.createElement("div");
    el.id = "tour-caption";
    el.setAttribute("role", "status");
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.hidden = !text;
}

function playClip(id: string): Promise<boolean> {
  return new Promise((resolve) => {
    const audio = new Audio(new URL(`tour/${id}.mp3`, new URL(import.meta.env.BASE_URL, window.location.href)).href);
    currentAudio = audio;
    audio.onended = () => resolve(true);
    audio.onerror = () => resolve(false);
    audio.play().catch(() => resolve(false));
  });
}

function speakWithBrowser(text: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window) || !speechSynthesis.getVoices().length) {
      resolve(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = speechSynthesis.getVoices();
    utterance.voice = voices.find((v) => v.lang === "en-GB") ?? voices.find((v) => v.lang.startsWith("en")) ?? null;
    utterance.rate = 1.02;
    utterance.onend = () => resolve(true);
    utterance.onerror = () => resolve(false);
    speechSynthesis.speak(utterance);
  });
}

/** Shows a line and speaks it, then waits for it to finish. */
async function say(id: LineId) {
  if (stopped) throw new Error("tour stopped");
  const text = lines[id];
  caption(text);
  const spoken = (await playClip(id)) || (await speakWithBrowser(text));
  if (!spoken) await sleep(600 + text.split(" ").length * 340);
  await sleep(260);
}

async function waitFor<T extends Element>(find: () => T | null | undefined, timeout = 30000): Promise<T | null> {
  const start = performance.now();
  while (performance.now() - start < timeout) {
    if (stopped) throw new Error("tour stopped");
    const found = find();
    if (found) return found;
    await sleep(120);
  }
  return null;
}

const one = <T extends Element = HTMLElement>(selector: string) => document.querySelector<T>(selector);

function byText(selector: string, text: string) {
  return [...document.querySelectorAll<HTMLElement>(selector)].find((el) => el.textContent?.includes(text)) ?? null;
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

async function practiceRound() {
  const name = await waitFor(() => one<HTMLInputElement>("#house"));
  if (name) setName(name, "Quill & Daughters");
  await say("intro1");
  await say("intro2");
  byText("button", "Open for business")?.click();
  await waitFor(() => one(".slip-open"), 15000);
  await sleep(500);

  // Choose the slip with the best odds, the way a player would.
  const best = one(".slip:not(.open) .slip-head:has(.odds.good)");
  if (best && !one(".slip.open .odds.good")) best.click();
  await sleep(500);
  await say("slip1");
  one(".why")?.click();
  await say("slip2");
  byText(".slip-open button.link", "Survey for")?.click();
  await sleep(400);
  await say("survey");
  await say("sign");
  one(".slip-open .primary")?.click();
  await sleep(600);
  one('[aria-label="Fast"]')?.click();
  await say("ring");

  const outcome = await waitFor(() => one(".toast.safe, .toast.lost"), 30000);
  if (outcome?.classList.contains("safe")) await say("safe");
  else if (outcome) await say("lost");
  else await say("waiting");
  await sleep(600);
}

async function spiral() {
  await openTab("Under the hood");
  byText("button", "Watch a spiral collapse")?.click();
  await sleep(700);
  await say("spiral1");
  await waitFor(() => byText(".ticker li", "breaks over"), 15000);
  await say("storm");
  await waitFor(() => byText(".toast", "A house has failed"), 30000);
  await say("fall");
  await waitFor(() => one(".modal"), 60000);
  await sleep(500);
  await say("gone1");
  await say("gone2");
  byText(".modal button", "Open your own house")?.click();
}

async function liveRound() {
  const name = await waitFor(() => one<HTMLInputElement>("#house"), 8000);
  if (name) setName(name, "Quill & Daughters");
  await sleep(300);
  byText("button", "Join the live Room")?.click();
  await say("live1");
  await waitFor(() => one(".top .capital"), 45000);
  await sleep(500);
  await openTab("Under the hood");
  await say("live2");

  const sign = await waitFor(() => {
    const head = one(".slip:not(.open) .slip-head");
    if (!one(".slip-open") && head) head.click();
    const button = one<HTMLButtonElement>(".slip-open .primary");
    return button && !button.disabled ? button : null;
  }, 40000);
  sign?.click();
  await waitFor(() => byText(".hood dt", "Last action"), 20000);
  await say("live3");
  await say("live4");
  await say("end");
  await sleep(1500);
}

export async function runTour() {
  stopped = false;
  document.body.classList.add("touring");
  speechSynthesis?.getVoices();
  const stop = () => {
    stopped = true;
    currentAudio?.pause();
    window.speechSynthesis?.cancel();
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
