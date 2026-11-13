// The main game: send your ships out, bring them home rich, and build the best town on the sea.

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import * as sound from "./audio";
import { place } from "./cast";
import { PracticeDriver, TOWN_WATCH_MS } from "./engine";
import { tourStage } from "./tour";
import { useNarrow, useView } from "./hooks";
import lines from "./pipLines.json";
import { writeTownSave } from "./progress";
import { gameLink } from "./social";
import type { Action, ChatLine, Driver, FleetShip, GameEvent, TownInfo, View } from "./types";
import { Character, Coin, type Mood } from "./ui/art";
import Chart, { TOWN_PLOTS, type Fit } from "./ui/Chart";
import Fleet from "./ui/Fleet";
import { Helper, type Say } from "./ui/Helper";
import { SoundButtons, useCounting } from "./ui/Hud";
import Share from "./ui/Share";
import { Toasts, type Toast } from "./ui/Overlays";
import Side, { type Hood, type Tab } from "./ui/Side";
import { Theatre, type Moment } from "./ui/Theatre";
import TownPanels, { CREW_INFO, type Sheet } from "./ui/TownPanels";
import { BuildingArt, ChestArt, Flame, ShipArt } from "./ui/townArt";
import { crowns, shortAccount } from "./words";

type LineId = keyof typeof lines;

function pip(id: LineId): Say {
  const line = lines[id] as { text: string; mood: string };
  return { id, text: line.text, mood: line.mood === "warm" ? "happy" : line.mood === "sad" ? "worried" : (line.mood as Mood) };
}

const TOLD_KEY = "fw-town-told";
const MUTED_KEY = "fw-town-muted";

function loadMuted(): string[] {
  try {
    return JSON.parse(localStorage.getItem(MUTED_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

function saveMuted(names: string[]) {
  try {
    localStorage.setItem(MUTED_KEY, JSON.stringify(names));
  } catch {
    // A private window may refuse storage. The mute then lasts as long as the tab.
  }
}

/** Turns what went wrong into something a player can act on. */
function friendly(error: unknown) {
  const text = error instanceof Error ? error.message : "";
  if (/not ?enough ?(balance|allowance)|lack ?balance|insufficient/i.test(text)) return "This online account has used up its free moves for now.";
  return text || "That didn't work. Try again.";
}

function loadTold() {
  try {
    if (document.body.classList.contains("touring")) return new Set<string>();
    return new Set<string>(JSON.parse(localStorage.getItem(TOLD_KEY) ?? "[]") as string[]);
  } catch {
    return new Set<string>();
  }
}

function saveTold(told: Set<string>) {
  try {
    if (!document.body.classList.contains("touring")) localStorage.setItem(TOLD_KEY, JSON.stringify([...told]));
  } catch {
    // A private window may refuse storage. Pip just repeats a tip next time.
  }
}

interface Props {
  driver: Driver;
  name: string;
  hood: Hood;
  /** True when carrying on from a saved town. */
  resumed: boolean;
  onExit: () => void;
  onSpiral: () => void;
}

interface Flyer {
  id: number;
  group: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  delay: number;
}

interface ChestWin {
  id: number;
  coins: number;
  chest: number;
  streak: number;
}

interface Goal {
  key: string;
  name: string;
  cost: number;
  art: ReactNode;
  buy: Action;
  fresh: boolean;
}

/** The next thing worth saving for: something new if there is one, or else the cheapest. */
function nextGoal(view: View): Goal | null {
  const town = view.town;
  if (!town) return null;
  const goals: Goal[] = [];
  view.catalog.buildings.forEach((b, kind) => {
    const owned = town.buildings[kind];
    if (owned >= b.max || town.level < b.level) return;
    goals.push({ key: `b${kind}`, name: b.name, cost: town.building_costs[kind], art: <BuildingArt kind={kind} size={50} />, buy: { kind: "build", building: kind }, fresh: owned === 0 });
  });
  if (town.ships.length < town.ship_room) {
    view.catalog.ships.forEach((s, cls) => {
      if (cls === 0 || town.level < s.level) return;
      goals.push({ key: `s${cls}`, name: s.name, cost: s.cost, art: <ShipArt cls={cls} size={54} />, buy: { kind: "buy_ship", class: cls }, fresh: !town.ships.some((x) => x.class === cls) });
    });
  }
  if (town.crew.reduce((sum, n) => sum + n, 0) < town.crew_room) {
    view.catalog.crew.forEach((c, kind) => {
      if (town.crew[kind] >= c.max || town.level < c.level) return;
      goals.push({ key: `c${kind}`, name: c.name, cost: town.crew_costs[kind], art: <Character id={CREW_INFO[kind].face} size={50} />, buy: { kind: "hire", crew: kind }, fresh: town.crew[kind] === 0 });
    });
  }
  goals.sort((a, b) => Number(b.fresh) - Number(a.fresh) || a.cost - b.cost);
  return goals[0] ?? null;
}

/** A post for near.social, with a link to the game when it's hosted somewhere others can open. */
function postFor(text: string) {
  const link = gameLink();
  return `${text} ⚓ #foulweather${link ? `\n${link}` : ""}`;
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** What a town's own post says about it. */
function townPost(town: TownInfo) {
  const built = town.buildings.reduce((sum, n) => sum + n, 0);
  const has = built > 0 ? `${count(town.ships.length, "ship", "ships")} and ${count(built, "building", "buildings")}` : count(town.ships.length, "ship", "ships");
  return `My harbor town ${town.name} is at level ${town.level} in Foul Weather, with ${has}. Every trip is a gamble: come home in time, or risk it for treasure!`;
}

function TownBar({
  view,
  town,
  watchMs,
  online,
  wallet,
  onHome,
  onLedger,
  onShare,
}: {
  view: View;
  town: TownInfo;
  watchMs: number;
  online: boolean;
  /** The player's own NEAR account, when they connected a wallet. */
  wallet: string | null;
  onHome: () => void;
  onLedger: () => void;
  onShare: () => void;
}) {
  const coins = useCounting(town.coins);
  const left = Math.max(0, Math.ceil(((view.season_watches - view.watch) * watchMs) / 1000));
  const clock = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  return (
    <header className="bar town-bar">
      <button className="logo" onClick={onHome} title="Back to the start">
        Foul Weather
      </button>
      <div className="level" title={`${town.xp_into} of ${town.xp_need} to the next level`}>
        <span className="level-badge">{town.level}</span>
        <span className="xp">
          <small>Level {town.level}</small>
          <span className="xp-bar">
            <i style={{ width: `${(town.xp_into / Math.max(1, town.xp_need)) * 100}%` }} />
          </span>
        </span>
      </div>
      <div className="pill coins" title="Your coins">
        <Coin size={28} /> <strong key={town.coins}>{crowns(coins)}</strong>
      </div>
      {town.streak >= 2 && (
        <div className="pill streak" title="Treasure chests in a row. Each one adds to your pay.">
          <Flame size={26} /> <strong>{town.streak}</strong>
          <small>+{town.streak_bonus}%</small>
        </div>
      )}
      <div className="festival" title="The top three towns at the Harbor Festival win prizes">
        <small>Harbor Festival in {clock}</small>
        <span className="xp-bar days">
          <i style={{ width: `${(view.watch / view.season_watches) * 100}%` }} />
        </span>
      </div>
      <div className="bar-buttons">
        {online && (
          <span className="online-chip" title="Real players around right now">
            {Math.max(1, view.towns.filter((t) => t.online).length)} online
          </span>
        )}
        {wallet && (
          <span className="wallet-chip" title={`Everything this town earns is paid to your own NEAR account, ${wallet}`}>
            {shortAccount(wallet)}
          </span>
        )}
        <SoundButtons />
        <button className="social-button" onClick={onShare} title="Share on near.social">
          Share
        </button>
        <button className="grown-ups" onClick={onLedger}>
          For grown-ups
        </button>
      </div>
    </header>
  );
}

/** The chest that pays out a finished trip. Tap it, or it opens by itself. */
function ChestPop({ win, onOpen, onDone }: { win: ChestWin; onOpen: (x: number, y: number) => void; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const lucky = win.chest > 100;

  const reveal = useCallback(() => {
    setOpen(true);
    sound.jingle(lucky ? "level" : "star");
    sound.coins();
    const box = ref.current?.getBoundingClientRect();
    if (box) onOpen(box.left + box.width / 2, box.top + box.height / 3);
  }, [lucky, onOpen]);

  useEffect(() => {
    const timer = window.setTimeout(() => (open ? onDone() : reveal()), open ? 2300 : 2600);
    return () => window.clearTimeout(timer);
  }, [open, reveal, onDone]);

  return (
    <div className="chest-back" role="dialog" aria-label="Treasure chest">
      <button ref={ref} className={`chest-pop${open ? " open" : ""}`} data-chest={open ? "open" : "shut"} onClick={() => (open ? onDone() : reveal())}>
        <span className="chest-title">{open ? (lucky ? `Lucky chest! ×${win.chest / 100}` : "Treasure!") : "A treasure chest!"}</span>
        <ChestArt size={210} open={open} />
        {open ? (
          <>
            <strong className="chest-coins">
              <Coin size={42} /> +{crowns(win.coins)}
            </strong>
            {win.streak >= 2 && (
              <span className="chest-streak">
                <Flame size={22} /> {win.streak} in a row!
              </span>
            )}
            <span className="chest-burst" aria-hidden="true">
              {Array.from({ length: 16 }, (_, i) => (
                <i key={i} style={{ "--a": `${(i / 16) * 360}deg`, "--d": `${110 + (i % 4) * 40}px` } as CSSProperties}>
                  <Coin size={26} />
                </i>
              ))}
            </span>
          </>
        ) : (
          <span className="chest-tap">Tap to open!</span>
        )}
      </button>
    </div>
  );
}

function LevelPop({ level, view, islands, onClose, onShare }: { level: number; view: View; islands: string[]; onClose: () => void; onShare: () => void }) {
  const news: { key: string; art: ReactNode; name: string }[] = [];
  view.catalog.buildings.forEach((b, kind) => {
    if (b.level === level) news.push({ key: `b${kind}`, art: <BuildingArt kind={kind} size={56} />, name: b.name });
  });
  view.catalog.ships.forEach((s, cls) => {
    if (cls > 0 && s.level === level) news.push({ key: `s${cls}`, art: <ShipArt cls={cls} size={62} />, name: s.name });
  });
  view.catalog.crew.forEach((c, kind) => {
    if (c.level === level) news.push({ key: `c${kind}`, art: <Character id={CREW_INFO[kind].face} size={56} />, name: c.name });
  });
  return (
    <div className="modal-back" role="dialog" aria-modal="true" aria-label="Level up">
      <div className="modal center">
        <div className="confetti" aria-hidden="true">
          {Array.from({ length: 22 }, (_, i) => (
            <i key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 7) * 0.09}s`, background: ["#e8504a", "#ffd23f", "#2d9cdb", "#2fae6e"][i % 4] }} />
          ))}
        </div>
        <span className="level-badge huge">{level}</span>
        <h2>Level {level}!</h2>
        {islands.length > 0 && (
          <p className="lede">
            New island: <b>{islands.join(", ")}</b>
          </p>
        )}
        {news.length > 0 && (
          <>
            <p className="lede">Now you can get:</p>
            <div className="level-news">
              {news.map((n) => (
                <span key={n.key}>
                  {n.art}
                  <b>{n.name}</b>
                </span>
              ))}
            </div>
          </>
        )}
        <button className="big-button" onClick={onClose} autoFocus>
          Hooray!
        </button>
        <button className="text-link" onClick={onShare}>
          Share it on near.social
        </button>
      </div>
    </div>
  );
}

function GoalCard({ goal, coins, busy, onBuy }: { goal: Goal | null; coins: number; busy: boolean; onBuy: () => void }) {
  if (!goal) return null;
  const ready = coins >= goal.cost;
  return (
    <button className={`goal-card${ready ? " ready" : ""}`} disabled={busy || !ready} onClick={onBuy} data-goal={goal.name}>
      <span className="goal-art">{goal.art}</span>
      <span className="goal-text">
        <small>{ready ? "You can get this now!" : "Saving for"}</small>
        <b>{goal.name}</b>
        <span className="xp-bar days">
          <i style={{ width: `${Math.min(100, (coins / goal.cost) * 100)}%` }} />
        </span>
        <span className="goal-cost">
          <Coin size={15} /> {crowns(Math.min(coins, goal.cost))} / {crowns(goal.cost)}
        </span>
      </span>
    </button>
  );
}

function Race({ view }: { view: View }) {
  const you = view.towns.findIndex((t) => t.you);
  // The top of the table, and always the player.
  const rows = view.towns.filter((t, i) => i < 4 || t.you).slice(0, 5);
  return (
    <section className="race town-race" aria-label="The richest towns">
      <h3>Richest towns</h3>
      <ol>
        {rows.map((row) => (
          <li key={row.id} className={row.you ? "you" : ""}>
            <b>{view.towns.indexOf(row) + 1}</b>
            <span>{row.you ? "You" : row.name}</span>
            {row.bot && <em className="bot-tag">bot</em>}
            <strong>{crowns(row.net_worth)}</strong>
          </li>
        ))}
      </ol>
      {you > 0 && (
        <p className="race-note">
          {crowns(view.towns[you - 1].net_worth - view.towns[you].net_worth + 1)} more to pass {view.towns[you - 1].name}
        </p>
      )}
    </section>
  );
}

/** Tap-to-say chat: everyone sees it, and nobody has to type. */
function HarborTalk({
  view,
  busy,
  muted,
  onMute,
  onSay,
  onType,
}: {
  view: View;
  busy: boolean;
  muted: string[];
  onMute: (name: string) => void;
  onSay: (phrase: number, to: number | null) => void;
  onType: (text: string, to: number | null) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const others = view.towns.filter((t) => !t.you);
  const target = others.find((t) => t.id === to) ?? null;
  const lines = view.chat.filter((line) => !muted.includes(line.name));
  const list = useRef<HTMLUListElement>(null);
  const newest = lines[lines.length - 1]?.id ?? 0;
  useEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [newest]);
  const reply = (line: ChatLine) => {
    if (!line.you) setTo(line.town);
  };
  const send = async () => {
    const text = draft.trim();
    if (!text) return;
    if (await onType(text, target ? target.id : null)) setDraft("");
  };
  return (
    <section className="race talk" aria-label="Harbor talk">
      <h3>Harbor talk</h3>
      <ul ref={list}>
        {lines.slice(-20).map((line) => (
          <li key={line.id} className={line.you ? "you" : line.bot ? "" : "real"}>
            <button className="talk-name" disabled={line.you} onClick={() => reply(line)} title={line.you ? undefined : `Answer ${line.name}`}>
              {line.you ? "You" : line.name}
            </button>
            {line.bot && <em className="bot-tag">bot</em>}
            {line.to_name && <small> to {line.to_you ? "you" : line.to_name}</small>}
            <span>{line.text}</span>
          </li>
        ))}
        {lines.length === 0 && <li className="talk-empty">Nobody has said anything yet.</li>}
      </ul>
      <label className="say-to">
        To
        <select value={to ?? ""} onChange={(e) => setTo(e.target.value === "" ? null : Number(e.target.value))} data-say-to>
          <option value="">Everyone</option>
          {others.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
              {t.bot ? " (bot)" : " (real player)"}
            </option>
          ))}
        </select>
      </label>
      {target && (
        <button className="text-link mute-link" onClick={() => onMute(target.name)} data-mute>
          {muted.includes(target.name) ? `Unmute ${target.name}` : `Mute ${target.name}`}
        </button>
      )}
      <form
        className="talk-type"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input value={draft} maxLength={120} placeholder="Type a message" onChange={(e) => setDraft(e.target.value)} autoComplete="off" aria-label="Type a message" data-chat-input />
        <button className="buy" type="submit" disabled={busy || !draft.trim()} data-chat-send>
          Send
        </button>
      </form>
      <p className="talk-warning">Everyone can read this, and it can't be deleted. Never share your name, school or address.</p>
      <button className="buy say-open" onClick={() => setOpen((v) => !v)} data-say-open>
        {open ? "Close" : "Quick words"}
      </button>
      {open && (
        <div className="phrases">
          <div className="phrase-grid">
            {view.catalog.phrases.map((text, i) => (
              <button
                key={text}
                disabled={busy}
                data-phrase={i}
                onClick={() => {
                  onSay(i, target ? target.id : null);
                  setOpen(false);
                }}
              >
                {text}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/** One building on the land, always on its own plot. */
function Plot({ kind, index, fit }: { kind: number; index: number; fit: Fit }) {
  const [x, y] = TOWN_PLOTS[kind][index];
  const size = Math.max(34, Math.min(92, 76 * fit.scale));
  return (
    <span className="plot" data-plot={`${kind}-${index}`} style={{ left: fit.x + x * fit.scale, top: fit.y + y * fit.scale, width: size, height: size }}>
      <BuildingArt kind={kind} size={size} />
    </span>
  );
}

export default function TownGame({ driver, name, hood, resumed, onExit, onSpiral }: Props) {
  const view = useView(driver);
  const practice = driver instanceof PracticeDriver ? driver : null;
  const narrow = useNarrow();
  const town = view?.town ?? null;

  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [says, setSays] = useState<Say[]>([]);
  const [moment, setMoment] = useState<Moment | null>(null);
  const [fit, setFit] = useState<Fit>({ scale: 1, x: 0, y: 0 });
  const [flyers, setFlyers] = useState<Flyer[]>([]);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [chests, setChests] = useState<ChestWin[]>([]);
  const [levelUp, setLevelUp] = useState<{ level: number; islands: string[] } | null>(null);
  const [ledger, setLedger] = useState(false);
  const [tab, setTab] = useState<Tab>("hood");
  const [sailedOnce, setSailedOnce] = useState(false);
  /** The near.social post being written, while the share box is open. */
  const [share, setShare] = useState<string | null>(null);
  const speech = useRef(new Map<number, { text: string; until: number }>());
  const [muted, setMuted] = useState<string[]>(loadMuted);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const lastChat = useRef(-1);
  const warned = useRef(new Set<number>());

  const lastSeq = useRef(-1);
  const previous = useRef<View | null>(null);
  const told = useRef(loadTold());
  const toastId = useRef(1);
  const momentId = useRef(1);
  const flyerGroup = useRef(1);

  const toast = useCallback((t: Omit<Toast, "id">) => {
    const id = toastId.current++;
    setToasts((list) => [...list.slice(-2), { ...t, id }]);
    window.setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), 3200);
  }, []);

  const speak = useCallback((say: Say) => {
    setSays((list) => (list.some((s) => s.id === say.id) ? list : [say]));
  }, []);

  const once = useCallback(
    (id: LineId) => {
      if (told.current.has(id)) return;
      told.current.add(id);
      saveTold(told.current);
      speak(pip(id));
    },
    [speak],
  );

  const flyCoins = useCallback((x: number, y: number, count = 6) => {
    const target = document.querySelector(".pill.coins")?.getBoundingClientRect();
    if (!target) return;
    const group = flyerGroup.current++;
    const added = Array.from({ length: count }, (_, i) => ({ id: group * 100 + i, group, x, y, dx: target.left + 18 - x, dy: target.top + 14 - y, delay: i * 55 }));
    setFlyers((list) => [...list, ...added]);
    window.setTimeout(() => setFlyers((list) => list.filter((f) => f.group !== group)), 1500);
  }, []);

  const act = useCallback(
    async (action: Action) => {
      setBusy(true);
      setProblem(null);
      try {
        await driver.act(action);
        if (action.kind === "build" || action.kind === "buy_ship" || action.kind === "hire" || action.kind === "upgrade_ship") {
          sound.jingle("star");
          sound.coins();
        }
        if (action.kind === "send_ship") {
          sound.stamp();
          setSailedOnce(true);
          once("t2");
        }
        if (action.kind === "build") once("t5");
        if (action.kind === "hire") once("t6");
        if (action.kind === "buy_ship") once("t7");
        return true;
      } catch (e) {
        setProblem(friendly(e));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [driver, once],
  );

  // Pip's tips, spoken aloud, then gone.
  const current = says[0] ?? null;
  const spoken = current?.id ?? null;
  useEffect(() => {
    if (spoken && !document.body.classList.contains("touring")) void sound.speak(spoken);
  }, [spoken]);
  useEffect(() => {
    if (!says.length) return;
    const timer = window.setTimeout(() => setSays((list) => list.slice(1)), 6000);
    return () => window.clearTimeout(timer);
  }, [says]);
  useEffect(() => {
    sound.prepareVoice(["t0", "t1", "t2", "twild", "tchest", "tkept", "tsink", "tbuild"]);
  }, []);

  if (import.meta.env.DEV) (window as unknown as { fwDriver: Driver }).fwDriver = driver;

  // Start the world, and say hello.
  useEffect(() => {
    if (!view || lastSeq.current >= 0) return;
    lastSeq.current = view.seq;
    previous.current = view;
    practice?.setPace(TOWN_WATCH_MS);
    if (resumed) speak(pip("tback"));
    else once(driver.mode === "live" ? "t0live" : "t0");
  }, [view, practice, resumed, driver.mode, speak, once]);

  // On the guided tour, Pip decides when the world moves.
  useEffect(() => {
    if (!practice || !document.body.classList.contains("touring")) return;
    tourStage.pace = (ms) => practice.setPace(ms);
    return () => {
      tourStage.pace = null;
    };
  }, [practice]);

  // Keep a practice town, so a player can come back to it.
  useEffect(() => {
    if (!practice || document.body.classList.contains("touring")) return;
    const save = () => writeTownSave({ name, data: practice.save() });
    const hidden = () => {
      if (document.visibilityState === "hidden") save();
    };
    const timer = window.setInterval(save, 20_000);
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", save);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("pagehide", save);
      save();
    };
  }, [practice, name]);

  const hold = !!practice && (moment !== null || sheet !== null || chests.length > 0 || levelUp !== null || ledger || share !== null || view?.intermission !== null);
  useEffect(() => {
    if (!hold || !practice) return;
    const before = practice.pace();
    practice.setPace(0);
    return () => {
      if (practice.pace() === 0 && before) practice.setPace(before);
    };
  }, [hold, practice]);

  // What happened out there.
  useEffect(() => {
    if (!view?.town || lastSeq.current < 0) return;
    const me = view.town;
    const fresh = view.events.filter((e) => e.seq > lastSeq.current);
    lastSeq.current = Math.max(lastSeq.current, view.seq);
    const nameOf = (id: number) => view.towns.find((t) => t.id === id)?.name ?? "Another town";

    const handle = (e: GameEvent) => {
      switch (e.type) {
        case "trip_home":
          if (e.town !== me.id) return;
          sound.bell(2);
          sound.jingle("home");
          setChests((list) => [...list, { id: e.seq, coins: e.coins, chest: e.chest, streak: e.streak }]);
          once("tchest");
          if (e.streak >= 3) once("tstreak");
          return;
        case "trip_back":
          if (e.town !== me.id) return;
          sound.coins();
          toast({ kind: "good", title: `+${crowns(e.coins)} coins!`, sub: "Safe home" });
          flyCoins(190, 300, 5);
          once("tkept");
          return;
        case "trip_lost":
          if (e.town !== me.id) return;
          sound.bell(1);
          sound.thunder();
          sound.jingle("sad");
          setMoment({ id: momentId.current++, kind: "wreck", ship: "", captain: 0, amount: 0, note: e.paid > 0 ? `A shop paid you ${crowns(e.paid)} coins` : "The cargo is gone", seconds: 4 });
          speak(pip("tsink"));
          return;
        case "raided":
          if (e.town === me.id) {
            sound.jingle("sad");
            toast({ kind: "bad", title: `${nameOf(e.by)} robbed you!`, sub: `They took ${crowns(e.coins)} coins` });
            once("traided");
          } else if (e.by === me.id) {
            sound.jingle("star");
            sound.coins();
            toast({ kind: "good", title: "Your raid worked!", sub: `You stole ${crowns(e.coins)} coins` });
          }
          return;
        case "raid_failed":
          if (e.town === me.id) toast({ kind: "good", title: "You fought off raiders!", sub: nameOf(e.by) });
          else if (e.by === me.id) toast({ kind: "plain", title: "Your raid failed", sub: "They got away" });
          return;
        case "pirates_won":
          if (e.town === me.id) toast({ kind: "bad", title: "The pirates won!" });
          return;
        case "pirates_beaten":
          if (e.town !== me.id) return;
          sound.jingle("star");
          toast({ kind: "good", title: "You beat the pirates!", sub: "Their treasure is yours" });
          return;
        case "festival_prize":
          if (e.town !== me.id) return;
          sound.jingle("level");
          toast({ kind: "good", title: `Festival prize: +${crowns(e.coins)}!`, sub: `Your town came number ${e.place}` });
          return;
        case "storm_hit":
          if (e.great) sound.thunder();
          return;
        case "helped":
          if (e.town === me.id) {
            sound.jingle("star");
            sound.coins();
            toast({ kind: "good", title: `${nameOf(e.by)} helped your town!`, sub: `+${crowns(e.coins)} coins` });
            once("tfriend");
          } else if (e.by === me.id) {
            sound.coins();
            toast({ kind: "good", title: `You helped ${nameOf(e.town)}!`, sub: `You each got ${crowns(e.coins)} coins` });
          }
          return;
        case "gift":
          if (e.town === me.id) {
            sound.jingle("star");
            sound.coins();
            toast({ kind: "good", title: `${nameOf(e.by)} sent you a gift!`, sub: `+${crowns(e.coins)} coins` });
            once("tgift");
          } else if (e.by === me.id) {
            sound.coins();
            toast({ kind: "good", title: "Gift sent!", sub: `${nameOf(e.town)} got ${crowns(e.coins)} coins` });
          }
          return;
        case "trip_covered":
          if (e.by === me.id) {
            sound.coins();
            toast({ kind: "good", title: `+${crowns(e.fee)} coins!`, sub: `${nameOf(e.town)} paid your office to protect a trip` });
            once("tcovered");
          } else if (e.town === me.id) {
            toast({ kind: "plain", title: `${nameOf(e.by)} is protecting this trip`, sub: "That's a real player's office" });
          }
          return;
        case "cover_paid":
          if (e.town === me.id) {
            sound.jingle("sad");
            toast({ kind: "bad", title: `${nameOf(e.to)}'s ship sank`, sub: `Your office paid ${crowns(e.coins)} coins` });
          }
          return;
        default:
      }
    };
    fresh.forEach(handle);

    const before = previous.current?.town;
    if (before) {
      for (const ship of me.ships) {
        const old = before.ships.find((s) => s.id === ship.id);
        if (ship.trip && old?.trip && ship.trip.now > old.trip.now) {
          sound.tick((view.watch - ship.trip.sailed) / Math.max(1, ship.trip.arrives - ship.trip.sailed));
        }
      }
      if (me.level > before.level) {
        const islands: string[] = [];
        me.ships[0]?.routes.forEach((route, i) => {
          if (route.locked_until === 0 && (before.ships[0]?.routes[i]?.locked_until ?? 0) > 0) islands.push(place(view.ports[route.to].name));
        });
        sound.jingle("level");
        setLevelUp({ level: me.level, islands });
        speak(pip("tlevel"));
      }
    }
    // Passing another town is always worth a cheer.
    const was = previous.current?.towns.findIndex((t) => t.you) ?? -1;
    const now = view.towns.findIndex((t) => t.you);
    if (was > now && now >= 0 && was >= 0) {
      const passed = view.towns[now + 1];
      if (passed) {
        sound.jingle("star");
        toast({ kind: "good", title: `You passed ${passed.name}!`, sub: `You're number ${now + 1} now` });
        once("tpassed");
      }
    }
    // Harbor talk: bubbles over ships, and a note for anything from a real person.
    const newest = view.chat[view.chat.length - 1]?.id ?? 0;
    if (lastChat.current < 0) lastChat.current = newest;
    for (const line of view.chat) {
      if (line.id <= lastChat.current || mutedRef.current.includes(line.name)) continue;
      speech.current.set(line.town, { text: line.text.length > 38 ? `${line.text.slice(0, 36)}…` : line.text, until: performance.now() + 5000 });
      if (line.you) continue;
      if (line.to_you || !line.bot) {
        sound.tick(0.8);
        toast({ kind: "plain", title: `${line.name}${line.bot ? " (bot)" : ""}${line.to_you ? " to you" : ""}:`, sub: line.text });
        if (!line.bot) once("tchat");
      }
    }
    lastChat.current = Math.max(lastChat.current, newest);
    previous.current = view;
  }, [view, toast, once, speak, flyCoins]);

  // One small tip at a time, when it's useful.
  useEffect(() => {
    if (!town) return;
    const sailing = town.ships.filter((s) => s.trip);
    if (sailing.some((s) => (s.trip?.swell ?? 0) >= 75)) once("twild");
    if (sailing.some((s) => s.trip?.surprise && !s.trip.surprise_answered)) once("tsurprise");
    if (town.earned > 0 && town.coins >= town.building_costs[0] && town.buildings[0] === 0 && !sailing.length) once("tbuild");
    if (town.waiting >= 8) once("tcollect");
    if (town.buildings[11] > 0 && (view?.fleet.some((f) => !f.mine) ?? false)) once("traid");
    if (sailing.some((s) => s.trip?.convoy)) once("tconvoy");
    for (const ship of sailing) {
      if (ship.trip?.raid_from && !warned.current.has(ship.id)) {
        warned.current.add(ship.id);
        sound.bell(1);
        speak(pip("traidwarn"));
      } else if (!ship.trip?.raid_from) {
        warned.current.delete(ship.id);
      }
    }
    if (view?.towns.some((t) => !t.bot && !t.you && t.online) && !view.sandbox) once("tplayers");
  }, [town, view, once, speak]);

  const weather: sound.Weather = useMemo(() => {
    if (!town || !view) return 0;
    const trips = town.ships.flatMap((s) => (s.trip ? [s.trip] : []));
    if (trips.some((t) => t.swell >= 75 || t.storm_in === 0)) return 2;
    if (trips.some((t) => t.swell >= 55) || view.storms.some((s) => s.starts - view.watch <= 2)) return 1;
    return 0;
  }, [town, view]);
  useEffect(() => sound.setWeather(weather), [weather]);
  useEffect(() => () => sound.setWeather(0), []);
  const wrecking = moment?.kind === "wreck";
  useEffect(() => sound.duck("wreck", wrecking), [wrecking]);

  const endMoment = useCallback(() => setMoment(null), []);
  const endChest = useCallback(() => setChests((list) => list.slice(1)), []);
  const inset = useMemo(() => (narrow ? { left: 0, top: 8, bottom: 8 } : { left: 386, top: 70, bottom: 84 }), [narrow]);
  const onRival = useCallback(
    (ship: FleetShip) => {
      if (!town) return;
      if (town.buildings[11] === 0) {
        toast({ kind: "plain", title: "Build a Pirate Cove", sub: "Then you can raid this ship" });
      } else if (ship.raided) {
        toast({ kind: "plain", title: "Pirates are already after it" });
      } else if (town.raid_in > 0) {
        toast({ kind: "plain", title: "Your pirates are resting" });
      } else {
        void act({ kind: "raid", town: ship.town, ship: ship.ship });
        toast({ kind: "plain", title: `Raiding ${ship.town_name}…` });
      }
    },
    [town, act, toast],
  );

  if (!view || !town) return null;

  const watchMs = practice ? TOWN_WATCH_MS : view.watch_ms;
  const goal = nextGoal(view);
  const rank = view.towns.findIndex((t) => t.you);
  const firstGo = !sailedOnce && town.earned === 0 && town.ships.every((s) => !s.trip);
  const built = town.buildings.flatMap((n, kind) => Array.from({ length: n }, (_, i) => ({ kind, i })));
  const buy = {
    build: goal?.key.startsWith("b") ?? false,
    ships: goal?.key.startsWith("s") ?? false,
    crew: goal?.key.startsWith("c") ?? false,
  };
  const canBuy = town.earned > 0 && goal !== null && town.coins >= goal.cost;
  const signAt = { left: fit.x - 40 * fit.scale, top: fit.y + 158 * fit.scale };
  const collectAt = { left: fit.x - 40 * fit.scale, top: fit.y + 452 * fit.scale };

  return (
    <div className="game town-game">
      <TownBar
        view={view}
        town={town}
        watchMs={watchMs}
        online={driver.mode === "live"}
        wallet={hood.wallet ? hood.account : null}
        onHome={onExit}
        onLedger={() => setLedger(true)}
        onShare={() => setShare(postFor(townPost(town)))}
      />
      <main className={`sea${moment?.kind === "wreck" ? " shaking" : ""}`}>
        <Chart view={view} driver={driver} flash={0} built={[]} level={town.level} inset={inset} onFit={setFit} townMode onRival={onRival} speech={speech.current} />
        <span className="town-sign" style={signAt}>
          {town.name}
        </span>
        {built.map((b) => (
          <Plot key={`${b.kind}-${b.i}`} kind={b.kind} index={b.i} fit={fit} />
        ))}
        {town.waiting > 0 && (
          <button
            className={`collect${town.waiting >= town.store ? " full" : ""}`}
            style={collectAt}
            disabled={busy}
            data-collect
            onClick={(e) => {
              const box = e.currentTarget.getBoundingClientRect();
              flyCoins(box.left + box.width / 2, box.top, 7);
              sound.coins();
              void act({ kind: "collect_town" });
            }}
          >
            <Coin size={30} /> +{crowns(town.waiting)}
          </button>
        )}
        <Toasts toasts={toasts} />
        {flyers.map((f) => (
          <span key={f.id} className="flyer" style={{ left: f.x, top: f.y, animationDelay: `${f.delay}ms`, "--dx": `${f.dx}px`, "--dy": `${f.dy}px` } as CSSProperties}>
            <Coin size={26} />
          </span>
        ))}
        <Helper say={current} onNext={() => setSays((list) => list.slice(1))} />
        {moment && <Theatre moment={moment} onDone={endMoment} />}
        {problem && (
          <button className="problem-bar" onClick={() => setProblem(null)}>
            {problem}
          </button>
        )}
      </main>
      <aside className="town-side">
        {town.earned > 0 && (
          <GoalCard
            goal={goal}
            coins={town.coins}
            busy={busy}
            onBuy={() => {
              if (goal) void act(goal.buy);
            }}
          />
        )}
        <Race view={view} />
        <HarborTalk
          view={view}
          busy={busy}
          muted={muted}
          onMute={(who) => {
            const next = muted.includes(who) ? muted.filter((m) => m !== who) : [...muted, who];
            setMuted(next);
            saveMuted(next);
          }}
          onSay={(phrase, to) => void act({ kind: "say", phrase, to })}
          onType={(text, to) => act({ kind: "say_text", text, to })}
        />
      </aside>
      <Fleet view={view} watchMs={watchMs} busy={busy} spot={firstGo} act={(a) => void act(a)} onPick={() => once("t1")} />
      <nav className="town-nav" aria-label="Spend your coins">
        <button className={canBuy && buy.build ? "ready" : ""} onClick={() => setSheet("build")} data-sheet="build">
          <BuildingArt kind={0} size={40} />
          Build
        </button>
        <button className={canBuy && buy.ships ? "ready" : ""} onClick={() => setSheet("ships")} data-sheet="ships">
          <ShipArt cls={1} size={44} />
          Ships
        </button>
        <button className={canBuy && buy.crew ? "ready" : ""} onClick={() => setSheet("crew")} data-sheet="crew">
          <Character id={11} size={40} />
          Crew
        </button>
        <button onClick={() => setSheet("towns")} data-sheet="towns">
          <span className="rank-badge">{rank + 1}</span>
          Players
        </button>
      </nav>
      {sheet && <TownPanels view={view} busy={busy} act={(a) => void act(a)} tab={sheet} onClose={() => setSheet(null)} />}
      {chests[0] && <ChestPop key={chests[0].id} win={chests[0]} onOpen={flyCoins} onDone={endChest} />}
      {levelUp && !chests[0] && share === null && (
        <LevelPop
          level={levelUp.level}
          view={view}
          islands={levelUp.islands}
          onClose={() => setLevelUp(null)}
          onShare={() => {
            setShare(postFor(`My harbor town ${town.name} just reached level ${levelUp.level} in Foul Weather!`));
            setLevelUp(null);
          }}
        />
      )}
      {ledger && (
        <div className="drawer" role="dialog" aria-label="For grown-ups">
          <button className="drawer-close" onClick={() => setLedger(false)}>
            Close
          </button>
          <Side
            view={view}
            you={undefined}
            act={async (a) => {
              await act(a);
              return null;
            }}
            busy={busy}
            tab={tab}
            setTab={setTab}
            badge={{ book: false, room: false, harbor: false }}
            priceTrail={{}}
            hood={hood}
            practice={!!practice}
            onSkip={() => practice?.skip(view.watches_per_day)}
            onRunWeek={() => practice?.skip(view.watches_per_day * 7)}
            onSpiral={onSpiral}
            onSummon={() => void act({ kind: "summon_storm" })}
          />
        </div>
      )}
      {view.intermission !== null && !chests[0] && (
        <div className="modal-back" role="dialog" aria-modal="true" aria-label="Harbor Festival">
          <div className="modal center">
            <h2>The Harbor Festival!</h2>
            <p className="lede">{rank === 0 ? "Your town came first! Hooray!" : `Your town came number ${rank + 1} of ${view.towns.length}.`}</p>
            <ol className="town-rank">
              {view.towns.slice(0, 5).map((row, i) => (
                <li key={row.id} className={row.you ? "you" : ""}>
                  <b>{i + 1}</b>
                  <span>{row.you ? `${row.name} (you)` : row.name}</span>
                  <strong>
                    <Coin size={15} /> {crowns(row.net_worth)}
                  </strong>
                </li>
              ))}
            </ol>
            <p>Your coins, ships and buildings stay yours.</p>
            <button
              className="text-link"
              onClick={() =>
                setShare(
                  postFor(
                    rank === 0
                      ? `My harbor town ${town.name} won the Harbor Festival in Foul Weather!`
                      : `My harbor town ${town.name} came number ${rank + 1} of ${view.towns.length} at the Harbor Festival in Foul Weather!`,
                  ),
                )
              }
            >
              Share it on near.social
            </button>
            {practice ? (
              <button
                className="big-button"
                onClick={() => {
                  void driver.act({ kind: "next_season" }).then(() => practice.setPace(TOWN_WATCH_MS));
                }}
              >
                Next season!
              </button>
            ) : (
              <p className="working">The next season starts by itself in a moment.</p>
            )}
          </div>
        </div>
      )}
      {share !== null && <Share message={share} onClose={() => setShare(null)} />}
    </div>
  );
}
