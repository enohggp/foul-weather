// The game screen: a bright harbor, a dock of captains, and Pip to help.

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import * as sound from "./audio";
import { CAST, fullName, shopName } from "./cast";
import { NORMAL_WATCH_MS, PracticeDriver, SPIRAL_MS, WEEK_IN_A_MINUTE_MS } from "./engine";
import { useNarrow, useView } from "./hooks";
import { BUILDS, levelOf, loadProgress, QUESTS, saveProgress, SKILL, UNLOCKS, unlocked, type Progress } from "./progress";
import type { Action, Driver, GameEvent, Position, Receipt, Slip, View } from "./types";
import lines from "./pipLines.json";
import { Coin, Star, type Mood } from "./ui/art";
import Chart, { PORTS, type Fit } from "./ui/Chart";
import { Helper, type Say } from "./ui/Helper";
import { BuildShop, LevelUp, MyShips, Quests, Race, shopColour, TopBar } from "./ui/Hud";
import { Collapse, Report, StruckOff, Toasts, WeekReview, type Fallen, type Toast } from "./ui/Overlays";
import Side, { type Hood, type Tab } from "./ui/Side";
import { Theatre, type Moment } from "./ui/Theatre";
import Dock, { dealFor, type Deal } from "./ui/Visitors";
import { crowns } from "./words";

interface Props {
  driver: Driver;
  houseName: string;
  hood: Hood;
  onExit: () => void;
  onSpiral: () => void;
  autoplay: boolean;
  spiral?: boolean;
}

interface Reward {
  id: number;
  port: number;
  captain: number;
  stars: number;
}

interface Flyer {
  id: number;
  group: number;
  kind: "coin" | "star";
  x: number;
  y: number;
  dx: number;
  dy: number;
  delay: number;
}

/** The last shop in the demo falls 20 watches in. See scripts/find-spiral.mjs. */
const SPIRAL_WATCHES = 23;

type LineId = keyof typeof lines;

/** One of Pip's lines. The words on screen and the recording come from the same list. */
function pip(id: LineId): Say {
  const line = lines[id] as { text: string; mood: string };
  return { id, text: line.text, mood: line.mood === "warm" ? "happy" : line.mood === "sad" ? "worried" : (line.mood as Mood) };
}

const COACH: Say[] = [
  { ...pip("c0"), next: "Hello, Pip!" },
  { ...pip("c1"), next: "OK!" },
  { ...pip("c2"), next: "I see" },
  { ...pip("c3"), next: "Got it" },
  pip("c4"),
];
const LESSON_VOICE = ["c0", "c1", "c2", "c3", "c4", "ready", "ring", "collect", "goal", "wreck"];
const SPOT = ["", "earn", "lose", "danger", "yes"];

const roomCoins = (view: View) => view.houses.filter((h) => h.active).reduce((sum, h) => sum + h.capital, 0);

export default function Game({ driver, houseName, hood, onExit, onSpiral, spiral }: Props) {
  const view = useView(driver);
  if (import.meta.env.DEV) (window as unknown as { fwDriver: Driver }).fwDriver = driver;
  const practice = driver instanceof PracticeDriver ? driver : null;
  const you = view?.houses.find((h) => h.you);
  const narrow = useNarrow();

  const [progress, setProgress] = useState<Progress>(loadProgress);
  const progressRef = useRef(progress);
  const [coach, setCoach] = useState(() => (practice && !spiral && !loadProgress().taught ? 0 : -1));
  const [only, setOnly] = useState<number | null>(null);
  const [passed, setPassed] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [says, setSays] = useState<Say[]>([]);
  const [flash, setFlash] = useState(0);
  const [pace, setPace] = useState(() => (practice ? practice.pace() : NORMAL_WATCH_MS));
  const [problem, setProblem] = useState<string | null>(null);
  const [priceTrail, setPriceTrail] = useState<Record<string, number[]>>({});
  const [moment, setMoment] = useState<Moment | null>(null);
  const [queue, setQueue] = useState<Moment[]>([]);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [fit, setFit] = useState<Fit>({ scale: 1, x: 0, y: 0 });
  const [flyers, setFlyers] = useState<Flyer[]>([]);
  const [levelUp, setLevelUp] = useState<number | null>(null);
  const [shopOpen, setShopOpen] = useState(false);
  const [ledger, setLedger] = useState(false);
  const [tab, setTab] = useState<Tab>("hood");
  const [watching, setWatching] = useState(false);
  const [week, setWeek] = useState<{ left: number; capital: number; wrecks: number; failed: number; rate: number } | null>(null);
  const [review, setReview] = useState<{ capital: number; wrecks: number; failed: number; rate: number } | null>(null);
  const [collapse, setCollapse] = useState<{ fallen: Fallen[]; lost: number; wrecks: number } | null>(null);
  const started = useRef(!(practice && !spiral && !loadProgress().taught));
  const lastSeq = useRef(0);
  const previous = useRef<View | null>(null);
  const toastId = useRef(1);
  const momentId = useRef(1);
  const rewardId = useRef(1);
  const homeScenes = useRef(0);
  const earned = useRef(new Map<number, number>());
  const signed = useRef(new Map<number, number>());
  const told = useRef(new Set<string>());
  const spiralStart = useRef<{ watch: number; coins: number } | null>(null);
  const fitRef = useRef(fit);
  fitRef.current = fit;
  const flyerGroup = useRef(1);
  const quiet = useRef(!!spiral);
  const fallenRef = useRef<Fallen[]>([]);

  const toast = useCallback((t: Omit<Toast, "id">) => {
    const id = toastId.current++;
    setToasts((list) => [...list.slice(-2), { ...t, id }]);
    window.setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), 3800);
  }, []);

  const speak = useCallback((say: Say) => {
    setSays((list) => {
      if (list.some((s) => s.id === say.id)) return list;
      return [...list.filter((s) => s.actions), say];
    });
  }, []);

  /** Pip says something once per game. */
  const once = useCallback(
    (say: Say) => {
      if (told.current.has(say.id)) return;
      told.current.add(say.id);
      speak(say);
    },
    [speak],
  );

  const setSpeed = useCallback(
    (ms: number) => {
      practice?.setPace(ms);
      setPace(ms);
    },
    [practice],
  );

  /** Sends coins or stars flying up to the counter at the top. */
  const fly = useCallback((kind: Flyer["kind"], x: number, y: number) => {
    const target = document.querySelector(kind === "coin" ? ".pill.coins" : ".pill.stars")?.getBoundingClientRect();
    if (!target) return;
    const group = flyerGroup.current++;
    const count = kind === "coin" ? 8 : 3;
    const batch = Array.from({ length: count }, (_, i) => ({
      id: group * 100 + i,
      group,
      kind,
      x: x + (i - count / 2) * 9,
      y: y + ((i * 7) % 20) - 10,
      dx: target.left + 20 - x,
      dy: target.top + 20 - y,
      delay: i * 55,
    }));
    setFlyers((list) => [...list, ...batch]);
    window.setTimeout(() => setFlyers((list) => list.filter((f) => f.group !== group)), 1500);
  }, []);

  /** Adds to the player's progress, finishing quests and levels as they come. */
  const grow = useCallback(
    (count: string | null, xp = 0, stars = 0, coins = 0) => {
      if (quiet.current) return;
      const p = progressRef.current;
      const counts = count ? { ...p.counts, [count]: (p.counts[count] ?? 0) + 1 } : p.counts;
      let next: Progress = { ...p, counts, xp: p.xp + xp, stars: p.stars + stars };
      for (const q of QUESTS) {
        if (next.doneQuests.includes(q.id)) continue;
        const value = q.count === "coins" ? coins : (next.counts[q.count] ?? 0);
        if (value >= q.target) {
          next = { ...next, doneQuests: [...next.doneQuests, q.id], stars: next.stars + q.stars, xp: next.xp + 20 };
          sound.jingle("quest");
          if (!sound.isSpeaking() && !document.body.classList.contains("touring")) void sound.speak("quest");
          toast({ kind: "good", title: "Quest done!", sub: `${q.text}. +${q.stars} stars` });
        }
      }
      const before = levelOf(p.xp).level;
      const after = levelOf(next.xp).level;
      if (after > before) {
        setLevelUp(after);
        sound.jingle("level");
        if (!document.body.classList.contains("touring")) void sound.speak("level");
      }
      const cheapest = BUILDS.find((b) => !next.built.includes(b.id));
      if (cheapest && next.stars >= cheapest.stars && !told.current.has("build")) {
        told.current.add("build");
        speak(pip("build"));
      }
      progressRef.current = next;
      saveProgress(next);
      setProgress(next);
    },
    [toast, speak],
  );

  const act = useCallback(
    async (action: Action): Promise<Receipt | null> => {
      setBusy(true);
      setProblem(null);
      try {
        return await driver.act(action);
      } catch (e) {
        setProblem(e instanceof Error ? e.message : "That didn't work. Try again.");
        return null;
      } finally {
        setBusy(false);
      }
    },
    [driver],
  );

  // First look at the world.
  useEffect(() => {
    if (!view || lastSeq.current) return;
    lastSeq.current = view.seq;
    previous.current = view;
    if (spiral) {
      spiralStart.current = { watch: view.watch, coins: roomCoins(view) };
      speak(pip("spiral"));
    } else if (!practice) {
      speak(pip("live"));
    } else if (started.current) {
      setSpeed(NORMAL_WATCH_MS);
      speak(pip("back"));
    }
  }, [view, spiral, practice, speak, setSpeed]);

  // Choose the first captain for the lesson.
  useEffect(() => {
    if (!view || coach < 0 || coach > 4 || only !== null) return;
    // A great deal that sails soon, so the first reward isn't a long wait.
    const open = view.slips.filter((s) => s.qty > 0);
    const great = open.filter((s) => dealFor(view, s, you).verdict === "great");
    const first = [...(great.length ? great : open)].sort((a, b) => a.closes - b.closes)[0];
    if (first) setOnly(first.id);
  }, [view, you, coach, only]);

  // Hold the world still while something big is on the screen.
  const betweenSeasons = view !== null && view.intermission !== null;
  const hold = !!practice && (levelUp !== null || shopOpen || ledger || moment !== null || betweenSeasons);
  useEffect(() => {
    if (!hold || !practice) return;
    const before = practice.pace();
    practice.setPace(0);
    return () => {
      if (practice.pace() === 0 && before) practice.setPace(before);
    };
  }, [hold, practice]);

  // Everything that happened since the last look.
  useEffect(() => {
    if (!view) return;
    const before = previous.current;
    const fresh = view.events.filter((e) => e.seq > lastSeq.current);
    lastSeq.current = Math.max(lastSeq.current, view.seq);
    previous.current = view;
    const me = view.houses.find((h) => h.you);

    const mine = new Map<number, number>();
    if (before && me) {
      for (const p of before.positions) {
        if (p.writer === me.id) mine.set(p.voyage, (mine.get(p.voyage) ?? 0) + p.sum - p.ceded);
      }
    }

    const handle = (e: GameEvent) => {
      if (e.type === "bound" && me) {
        const held = view.positions.filter((p) => p.voyage === e.voyage && p.writer === me.id);
        if (held.length) {
          const fee = held.reduce((sum, p) => sum + Math.floor((p.sum * p.rate_bps) / 10000), 0);
          earned.current.set(e.voyage, fee);
          sound.coins();
          toast({ kind: "good", title: `+${crowns(fee)} coins!`, sub: `${CAST[e.captain % CAST.length].name} has set sail` });
          const f = fitRef.current;
          fly("coin", f.x + PORTS[0][0] * f.scale, f.y + PORTS[0][1] * f.scale);
          once(pip("ring"));
        }
      }
      if (quiet.current && e.type !== "house_failed" && e.type !== "storm_hit") return;
      if (e.type === "home" && mine.has(e.voyage)) {
        sound.bell(2);
        sound.jingle("home");
        const reward: Reward = { id: rewardId.current++, port: e.port, captain: e.captain, stars: 1 };
        rewardsRef.current = [...rewardsRef.current, reward];
        setRewards(rewardsRef.current);
        window.setTimeout(() => collectLater.current(reward.id), 16000);
        if (homeScenes.current < 2) {
          homeScenes.current += 1;
          setQueue((q) => [...q, { id: momentId.current++, kind: "home", ship: "", captain: e.captain, amount: 0 }]);
        }
        once(pip("collect"));
      }
      if (e.type === "wrecked" && mine.has(e.voyage)) {
        const amount = mine.get(e.voyage) ?? 0;
        sound.bell(1);
        sound.thunder();
        sound.jingle("sad");
        setQueue((q) => [...q, { id: momentId.current++, kind: "wreck", ship: view.captains[e.captain].ship, captain: e.captain, amount }]);
        once(pip("wreck"));
      }
      const realPlayer = "captain" in e && !!view.captains[e.captain]?.player;
      if (e.type === "claim_due" && me && e.suspicion >= 8 && (realPlayer || unlocked(progressRef.current.xp, SKILL.detective))) {
        const claim = view.claims.find((c) => c.id === e.claim);
        if (claim && view.positions.some((p) => p.voyage === claim.voyage && p.writer === me.id)) {
          speak({
            id: `detect-${e.claim}`,
            voice: "detect",
            text: `Hmm! That ship sank in strange weather. Did ${fullName(e.captain)} sink it on purpose? Investigate for ${view.fees.inquiry} coins?`,
            mood: "worried",
            actions: [
              {
                label: "Investigate!",
                run: () => {
                  void act({ kind: "inquiry", claim: e.claim });
                  grow("investigated", 15, 0, me.capital);
                  setSays((list) => list.filter((s) => s.id !== `detect-${e.claim}`));
                },
              },
              { label: "No, just pay", kind: "no", run: () => setSays((list) => list.filter((s) => s.id !== `detect-${e.claim}`)) },
            ],
          });
        }
      }
      if (e.type === "fraud" && me && e.house === me.id) {
        sound.coins();
        toast({ kind: "good", title: "Caught them!", sub: `You don't pay, and you get ${crowns(e.reward)} coins` });
      }
      if (e.type === "honest_loss" && me && e.house === me.id) {
        toast({ kind: "plain", title: "It was an accident", sub: "The captain told the truth" });
      }
      if (e.type === "glass") {
        if (e.great) sound.thunder();
        const risky = me ? view.positions.filter((p) => p.writer === me.id && e.lanes & (1 << p.lane) && p.ceded === 0) : [];
        if (risky.length && me) warnStorm.current(risky, e.great);
        else if (e.great) once(pip("great"));
      }
      if (e.type === "storm_hit") {
        setSays((list) => list.filter((s) => !s.id.startsWith("storm-")));
        if (e.great) {
          setFlash(performance.now());
          sound.thunder();
        }
      }
      if (e.type === "house_failed") {
        const fallen = view.houses[e.house];
        if (fallen) {
          fallenRef.current = [
            ...fallenRef.current,
            { name: fallen.name, colour: shopColour(view, fallen.id), watch: e.watch, owed: e.owed, paid: e.paid },
          ];
          if (!fallen.you) {
            toast({ kind: "bad", title: `${shopName(fallen.name)} closed!`, sub: "It ran out of coins" });
            if (spiral) {
              if (fallenRef.current.length === 1) {
                speak(pip("domino1"));
              } else if (fallenRef.current.length === 2) {
                setSays((list) => list.filter((s) => s.id !== "domino1"));
                speak(pip("domino2"));
              }
            } else {
              once(pip("closed"));
            }
          }
        }
      }
      if (e.type === "laid_up" && unlocked(progressRef.current.xp, SKILL.helper) && me) {
        speak({
          id: `help-${e.captain}`,
          voice: "help",
          text: `${fullName(e.captain)} has run out of coins! Lend ${crowns(view.fees.refit)} coins? They'll pay you back more later.`,
          actions: [
            {
              label: "Help them",
              run: () => {
                void act({ kind: "refit", captain: e.captain });
                grow("helped", 20, 0, me.capital);
                setSays((list) => list.filter((s) => s.id !== `help-${e.captain}`));
              },
            },
            { label: "Not today", kind: "no", run: () => setSays((list) => list.filter((s) => s.id !== `help-${e.captain}`)) },
          ],
        });
      }
      if (e.type === "ceded" && me && e.from === me.id) {
        sound.coins();
        toast({ kind: "good", title: "Danger shared!", sub: `${shopName(view.houses[e.to]?.name ?? "A shop")} will help pay` });
        grow("shared", 15, 0, me.capital);
      }
    };
    fresh.forEach(handle);

    // Tell the player what happened to ships they said YES to.
    if (before && me && !quiet.current) {
      for (const s of before.slips) {
        if (s.quotes.some((q) => q.house === me.id)) signed.current.set(s.id, s.captain);
      }
      for (const [id, captain] of signed.current) {
        if (view.slips.some((s) => s.id === id)) continue;
        signed.current.delete(id);
        const won = view.voyages.some((v) => v.captain === captain && view.positions.some((p) => p.voyage === v.id && p.writer === me.id));
        if (!won) {
          toast({ kind: "plain", title: "Another shop got this one", sub: `${CAST[captain % CAST.length].name} went with a cheaper shop` });
          once(pip("outbid"));
        }
      }
      const placed = new Set(fresh.flatMap((e) => (e.type === "ceded" ? [e.position] : [])));
      for (const o of before.offers) {
        if (o.house !== me.id || placed.has(o.position)) continue;
        if (!view.offers.some((x) => x.id === o.id) && view.positions.some((p) => p.id === o.position)) {
          toast({ kind: "plain", title: "No shop would share", sub: "Your ship is on its own" });
        }
      }
      if (me.active) grow(null, 0, 0, me.capital);
    }

    if (view.slips.some((s) => s.qty > 0 && view.captains[s.captain]?.player)) once(pip("shopreal"));

    const merrow = view.ports[0];
    setPriceTrail((trail) => {
      const next: Record<string, number[]> = {};
      for (const g of merrow.goods) next[g.name] = [...(trail[g.name] ?? []), g.price].slice(-40);
      return next;
    });
  }, [view, toast, once, speak, act, grow, fly, spiral]);

  const warnStorm = useRef<(risky: Position[], great: boolean) => void>(() => undefined);
  useEffect(() => {
    warnStorm.current = (risky, great) => {
      if (!view) return;
      const canShare = unlocked(progressRef.current.xp, SKILL.share);
      const cost = risky.reduce((sum, p) => sum + Math.floor(((p.sum * 0.75 * (p.lay_off_hint_bps || 800)) / 10000)), 0);
      const id = `storm-${view.watch}`;
      speak({
        id,
        voice: canShare ? "stormshare" : "storm",
        text: canShare
          ? `Storm coming! Your ship is in danger. Pay ${crowns(cost)} coins so a rival shop helps if it sinks?`
          : `${great ? "A big storm" : "A storm"} is coming towards your ship! Fingers crossed!`,
        mood: "worried",
        actions: canShare
          ? [
              {
                label: `Share the danger`,
                run: () => {
                  for (const p of risky) {
                    void act({ kind: "offer_cession", position: p.id, share_bps: 7500, rate_bps: p.lay_off_hint_bps || 800 });
                  }
                  setSays((list) => list.filter((s) => s.id !== id));
                },
              },
              { label: "Take the risk", kind: "no", run: () => setSays((list) => list.filter((s) => s.id !== id)) },
            ]
          : undefined,
      });
    };
  }, [view, speak, act]);

  const collectLater = useRef<(id: number) => void>(() => undefined);
  const rewardsRef = useRef<Reward[]>([]);
  const collect = useCallback(
    (id: number) => {
      const reward = rewardsRef.current.find((r) => r.id === id);
      if (!reward) return;
      rewardsRef.current = rewardsRef.current.filter((r) => r.id !== id);
      setRewards(rewardsRef.current);
      const f = fitRef.current;
      sound.jingle("star");
      fly("star", f.x + PORTS[reward.port][0] * f.scale, f.y + PORTS[reward.port][1] * f.scale);
      grow("collected", 15, 1, you?.capital ?? 0);
      once(pip("goal"));
    },
    [grow, fly, once, you?.capital],
  );
  collectLater.current = collect;

  // The background follows the weather: wind and rain for a storm, a darker tune for a big one.
  const you_id = you?.id;
  const weather: sound.Weather = useMemo(() => {
    if (!view) return 0;
    const hitting = view.storms.filter((s) => s.starts <= view.watch && view.watch < s.ends);
    const near = view.storms.filter((s) => s.starts - view.watch <= 2);
    const onMine = near.some((s) => view.positions.some((p) => p.writer === you_id && s.lanes.includes(p.lane)));
    if (hitting.some((s) => s.great) || onMine) return 2;
    return hitting.length || near.length ? 1 : 0;
  }, [view, you_id]);
  useEffect(() => sound.setWeather(weather), [weather]);
  useEffect(() => () => sound.setWeather(0), []);

  // A shipwreck needs a moment of quiet.
  const wrecking = moment?.kind === "wreck";
  useEffect(() => sound.duck("wreck", wrecking), [wrecking]);

  // One scene at a time.
  useEffect(() => {
    if (!moment && queue.length) {
      setMoment(queue[0]);
      setQueue((q) => q.slice(1));
    }
  }, [moment, queue]);
  const endMoment = useCallback(() => setMoment(null), []);

  // Pip's ordinary remarks fade by themselves.
  const current = coach >= 0 && coach <= 4 ? COACH[coach] : (says[0] ?? null);
  const spoken = current?.voice ?? current?.id ?? null;
  useEffect(() => {
    sound.prepareVoice(LESSON_VOICE);
  }, []);
  useEffect(() => {
    if (spoken && !document.body.classList.contains("touring")) void sound.speak(spoken);
  }, [spoken]);
  useEffect(() => {
    if (!says.length || says[0].actions || (coach >= 0 && coach <= 4)) return;
    const timer = window.setTimeout(() => setSays((list) => list.slice(1)), 6500);
    return () => window.clearTimeout(timer);
  }, [says, coach]);

  const yes = useCallback(
    (slip: Slip, deal: Deal) => {
      sound.stamp();
      void act({ kind: "quote", slip: slip.id, rate_bps: deal.rate, line_bps: deal.share });
      grow("protected", 10, 0, you?.capital ?? 0);
      once(pip("ready"));
      if (!started.current) {
        started.current = true;
        setCoach(-1);
        setOnly(null);
        setSpeed(NORMAL_WATCH_MS);
        const p = { ...progressRef.current, taught: true };
        progressRef.current = p;
        saveProgress(p);
        setProgress(p);
      }
    },
    [act, grow, once, setSpeed, you?.capital],
  );

  const no = useCallback(
    (slip: Slip, deal: Deal) => {
      setPassed((set) => new Set(set).add(slip.id));
      if (deal.verdict === "bad") {
        grow("refusedBad", 5, 0, you?.capital ?? 0);
        once(pip("smart"));
      }
    },
    [grow, once, you?.capital],
  );

  const shareOne = useCallback(
    (p: Position) => {
      void act({ kind: "offer_cession", position: p.id, share_bps: 7500, rate_bps: p.lay_off_hint_bps || 800 });
    },
    [act],
  );

  // A week in a minute, for grown-ups and judges.
  const runWeek = useCallback(() => {
    if (!practice || !view) return;
    const me = view.houses.find((h) => h.you);
    setWeek({
      left: 42,
      capital: me?.capital ?? 0,
      wrecks: view.captains.reduce((sum, c) => sum + c.losses, 0),
      failed: view.houses.filter((h) => !h.active).length,
      rate: view.market.rate_bps,
    });
    started.current = true;
    quiet.current = true;
    setCoach(-1);
    setLedger(false);
    void driver.act({ kind: "set_clerk", on: true });
    setSpeed(WEEK_IN_A_MINUTE_MS);
  }, [practice, view, driver, setSpeed]);

  useEffect(() => {
    if (!practice) return;
    practice.onWatch = () => setWeek((w) => (w ? { ...w, left: w.left - 1 } : w));
    return () => {
      practice.onWatch = null;
    };
  }, [practice]);

  const finishWeek = useCallback(() => {
    if (!week) return;
    setWeek(null);
    quiet.current = false;
    void driver.act({ kind: "set_clerk", on: false });
    setSpeed(0);
    setReview({ capital: week.capital, wrecks: week.wrecks, failed: week.failed, rate: week.rate });
  }, [week, driver, setSpeed]);

  useEffect(() => {
    if (week && (week.left <= 0 || view?.intermission !== null)) finishWeek();
  }, [week, view?.intermission, finishWeek]);

  // At the end of the spiral demo, explain what just happened.
  useEffect(() => {
    const start = spiralStart.current;
    if (!spiral || !view || !start || collapse) return;
    if (view.watch < start.watch + SPIRAL_WATCHES) return;
    setSpeed(0);
    setCollapse({
      fallen: fallenRef.current,
      lost: Math.max(0, start.coins - roomCoins(view)),
      wrecks: view.captains.reduce((sum, c) => sum + c.losses, 0),
    });
  }, [spiral, view, collapse, setSpeed]);

  // Finishing a season counts as a quest.
  const seasonDone = useRef(false);
  useEffect(() => {
    if (view?.intermission !== null && view?.intermission !== undefined && you?.active && !seasonDone.current) {
      seasonDone.current = true;
      grow("seasons", 40, 5, you.capital);
    }
    if (view?.intermission === null) seasonDone.current = false;
  }, [view?.intermission, you?.active, you?.capital, grow]);

  const inset = useMemo(() => (narrow ? { left: 0, top: 8, bottom: 8 } : { left: 386, top: 70, bottom: 4 }), [narrow]);
  const badge = useMemo(() => ({ book: false, room: !!view?.offers.length, harbor: false }), [view?.offers.length]);

  if (!view) return null;

  const showStruck = you && !you.active && !watching && view.intermission === null;
  const canShare = unlocked(progress.xp, SKILL.share);
  const watchMs = practice ? pace || NORMAL_WATCH_MS : view.watch_ms;

  return (
    <div className="game">
      <TopBar
        view={view}
        you={you}
        progress={progress}
        paused={pace === 0}
        fast={pace > 0 && pace < NORMAL_WATCH_MS}
        canPace={!!practice && started.current}
        onPause={() => setSpeed(0)}
        onPlay={() => setSpeed(NORMAL_WATCH_MS)}
        onFast={() => setSpeed(spiral ? SPIRAL_MS : WEEK_IN_A_MINUTE_MS)}
        onBuild={() => setShopOpen(true)}
        onLedger={() => setLedger(true)}
        onHome={onExit}
      />

      <main className={`sea${moment?.kind === "wreck" ? " shaking" : ""}`}>
        <Chart view={view} driver={driver} flash={flash} built={progress.built} level={levelOf(progress.xp).level} inset={inset} onFit={setFit} />
        {rewards.map((r) => (
          <button
            key={r.id}
            className="reward"
            style={{ left: fit.x + PORTS[r.port][0] * fit.scale, top: fit.y + PORTS[r.port][1] * fit.scale }}
            onClick={() => collect(r.id)}
            aria-label="Collect your star"
          >
            <Star size={50} />
          </button>
        ))}
        <Toasts toasts={toasts} />
        <div className="right-rail">
          {!spiral && <Quests progress={progress} coins={you?.capital ?? 0} />}
          {!spiral && <Race view={view} />}
        </div>
        {flyers.map((f) => (
          <span
            key={f.id}
            className="flyer"
            style={{ left: f.x, top: f.y, animationDelay: `${f.delay}ms`, "--dx": `${f.dx}px`, "--dy": `${f.dy}px` } as CSSProperties}
          >
            {f.kind === "coin" ? <Coin size={26} /> : <Star size={30} />}
          </span>
        ))}
        {week && (
          <div className="fastforward" role="status">
            <b>Pip is running your shop</b>
            <span>A week in a minute: {Math.max(0, week.left)} left</span>
            <button className="text-link" onClick={finishWeek}>
              Stop
            </button>
          </div>
        )}
        <Helper say={current} onNext={() => (coach >= 0 && coach < 4 ? setCoach(coach + 1) : setSays((list) => list.slice(1)))} />
        {moment && <Theatre moment={moment} onDone={endMoment} />}
        {problem && (
          <button className="problem-bar" onClick={() => setProblem(null)}>
            {problem}
          </button>
        )}
      </main>

      {spiral ? (
        <section className="dock">
          <Race view={view} wide />
        </section>
      ) : (
        <Dock
          view={view}
          you={you}
          xp={progress.xp}
          watchMs={watchMs}
          busy={busy}
          spotlight={coach >= 0 ? SPOT[coach] || null : null}
          lockNo={coach >= 0}
          passed={passed}
          only={coach >= 0 ? only : null}
          onYes={yes}
          onNo={no}
          act={act}
          onInspect={() => grow("inspected", 10, 0, you?.capital ?? 0)}
        >
          <MyShips view={view} you={you} canShare={canShare} busy={busy} onShare={shareOne} />
        </Dock>
      )}

      {ledger && (
        <div className="drawer" role="dialog" aria-label="For grown-ups">
          <button className="drawer-close" onClick={() => setLedger(false)}>
            Close
          </button>
          <Side
            view={view}
            you={you}
            act={act}
            busy={busy}
            tab={tab}
            setTab={setTab}
            badge={badge}
            priceTrail={priceTrail}
            hood={hood}
            practice={!!practice}
            onSkip={() => {
              if (!practice) return;
              started.current = true;
              setCoach(-1);
              setLedger(false);
              void (async () => {
                await driver.act({ kind: "set_clerk", on: true });
                setSpeed(0);
                practice.skip(Math.max(1, view.season_watches - view.watch));
                await driver.act({ kind: "set_clerk", on: false }).catch(() => undefined);
              })();
            }}
            onRunWeek={runWeek}
            onSpiral={onSpiral}
            onSummon={() => {
              started.current = true;
              setCoach(-1);
              setLedger(false);
              void act({ kind: "summon_storm" });
              if (!pace) setSpeed(NORMAL_WATCH_MS);
            }}
          />
        </div>
      )}

      {shopOpen && (
        <BuildShop
          progress={progress}
          onBuy={(id, stars) => {
            const p = progressRef.current;
            if (p.stars < stars || p.built.includes(id)) return;
            const next = { ...p, stars: p.stars - stars, built: [...p.built, id] };
            progressRef.current = next;
            saveProgress(next);
            setProgress(next);
            sound.coins();
          }}
          onClose={() => setShopOpen(false)}
        />
      )}
      {levelUp !== null && <LevelUp level={levelUp} unlock={UNLOCKS[levelUp]} onClose={() => setLevelUp(null)} />}
      {review && (
        <WeekReview
          view={view}
          before={review}
          onClose={() => {
            setReview(null);
            setSpeed(NORMAL_WATCH_MS);
          }}
        />
      )}
      {collapse && <Collapse {...collapse} onClose={onExit} />}
      {view.intermission !== null && (
        <Report
          view={view}
          you={you}
          practice={!!practice}
          onNext={() => {
            setWatching(false);
            setPassed(new Set());
            signed.current.clear();
            void (async () => {
              await act({ kind: "next_season" });
              await act({ kind: "found_house", name: houseName });
              setSpeed(NORMAL_WATCH_MS);
            })();
          }}
        />
      )}
      {showStruck && you && (
        <StruckOff you={you} onRefound={() => void act({ kind: "found_house", name: houseName })} onWatch={() => setWatching(true)} />
      )}
    </div>
  );
}
