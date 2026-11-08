// The game from the captain's side: your own ship, your own coins, and real shops to deal with.

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import * as sound from "./audio";
import { fullName, shopName } from "./cast";
import { NORMAL_WATCH_MS, PracticeDriver, WEEK_IN_A_MINUTE_MS } from "./engine";
import { useNarrow, useView } from "./hooks";
import lines from "./pipLines.json";
import { CAPTAIN_QUESTS, levelOf, loadProgress, saveProgress, type Progress } from "./progress";
import type { Action, Driver, GameEvent, View } from "./types";
import { Coin, Star, type Mood } from "./ui/art";
import Bridge, { CaptainRace } from "./ui/Bridge";
import Chart, { PORTS, type Fit } from "./ui/Chart";
import { Helper, type Say } from "./ui/Helper";
import { BuildShop, Quests, TopBar } from "./ui/Hud";
import { Toasts, type Toast } from "./ui/Overlays";
import Side, { type Hood, type Tab } from "./ui/Side";
import { Theatre, type Moment } from "./ui/Theatre";
import { crowns } from "./words";

type LineId = keyof typeof lines;

function pip(id: LineId): Say {
  const line = lines[id] as { text: string; mood: string };
  return { id, text: line.text, mood: line.mood === "warm" ? "happy" : line.mood === "sad" ? "worried" : (line.mood as Mood) };
}

interface Props {
  driver: Driver;
  name: string;
  captain: number;
  hood: Hood;
  onExit: () => void;
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

export default function CaptainGame({ driver, name, captain, hood, onExit }: Props) {
  const view = useView(driver);
  const practice = driver instanceof PracticeDriver ? driver : null;
  const narrow = useNarrow();
  const myId = view?.helm?.captain ?? captain;
  const me = view?.captains[myId];

  const [progress, setProgress] = useState<Progress>(loadProgress);
  const progressRef = useRef(progress);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [says, setSays] = useState<Say[]>([]);
  const [moment, setMoment] = useState<Moment | null>(null);
  const [fit, setFit] = useState<Fit>({ scale: 1, x: 0, y: 0 });
  const [pace, setPace] = useState(NORMAL_WATCH_MS);
  const [flyers, setFlyers] = useState<Flyer[]>([]);
  const [star, setStar] = useState<{ port: number } | null>(null);
  const [shopOpen, setShopOpen] = useState(false);
  const [ledger, setLedger] = useState(false);
  const [tab, setTab] = useState<Tab>("hood");

  const lastSeq = useRef(0);
  const previous = useRef<View | null>(null);
  const told = useRef(new Set<string>());
  const toastId = useRef(1);
  const momentId = useRef(1);
  const flyerGroup = useRef(1);
  const fitRef = useRef(fit);
  fitRef.current = fit;
  const answered = useRef(new Set<string>());

  const toast = useCallback((t: Omit<Toast, "id">) => {
    const id = toastId.current++;
    setToasts((list) => [...list.slice(-2), { ...t, id }]);
    window.setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), 3800);
  }, []);

  const speak = useCallback((say: Say) => {
    setSays((list) => (list.some((s) => s.id === say.id) ? list : [say]));
  }, []);

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

  const grow = useCallback(
    (count: string | null, xp = 0, stars = 0, earned = 0) => {
      const p = progressRef.current;
      const counts = count ? { ...p.counts, [count]: (p.counts[count] ?? 0) + 1 } : p.counts;
      let next: Progress = { ...p, counts: { ...counts, earned: Math.max(counts.earned ?? 0, earned) }, xp: p.xp + xp, stars: p.stars + stars };
      for (const q of CAPTAIN_QUESTS) {
        if (next.doneQuests.includes(q.id)) continue;
        if ((next.counts[q.count] ?? 0) >= q.target) {
          next = { ...next, doneQuests: [...next.doneQuests, q.id], stars: next.stars + q.stars, xp: next.xp + 20 };
          sound.jingle("quest");
          toast({ kind: "good", title: "Quest done!", sub: `${q.text}. +${q.stars} stars` });
        }
      }
      if (levelOf(next.xp).level > levelOf(p.xp).level) sound.jingle("level");
      progressRef.current = next;
      saveProgress(next);
      setProgress(next);
    },
    [toast],
  );

  const act = useCallback(
    async (action: Action) => {
      setBusy(true);
      setProblem(null);
      try {
        await driver.act(action);
        if (action.kind === "plan_trip") {
          sound.stamp();
          once(pip(action.offer_bps === 0 ? "capbare" : "capask"));
        }
      } catch (e) {
        setProblem(e instanceof Error ? e.message : "That didn't work. Try again.");
      } finally {
        setBusy(false);
      }
    },
    [driver, once],
  );

  // Pip's remarks, spoken aloud, then gone.
  const current = says[0] ?? null;
  const spoken = current?.id ?? null;
  useEffect(() => {
    if (spoken && !document.body.classList.contains("touring")) void sound.speak(spoken);
  }, [spoken]);
  useEffect(() => {
    if (!says.length) return;
    const timer = window.setTimeout(() => setSays((list) => list.slice(1)), 6500);
    return () => window.clearTimeout(timer);
  }, [says]);
  useEffect(() => {
    sound.prepareVoice(["cap0", "cap1", "capask", "capsail", "caphome", "capreal"]);
  }, []);

  // Start the world, and greet the new captain.
  useEffect(() => {
    if (!view || lastSeq.current) return;
    lastSeq.current = view.seq;
    previous.current = view;
    if (practice) setSpeed(NORMAL_WATCH_MS);
    once(pip(driver.mode === "live" ? "cap0live" : "cap0"));
  }, [view, practice, driver.mode, setSpeed, once]);

  const hold = !!practice && (moment !== null || shopOpen || ledger || view?.intermission !== null);
  useEffect(() => {
    if (!hold || !practice) return;
    const before = practice.pace();
    practice.setPace(0);
    return () => {
      if (practice.pace() === 0 && before) practice.setPace(before);
    };
  }, [hold, practice]);

  // What happened to my ship.
  useEffect(() => {
    if (!view) return;
    const fresh = view.events.filter((e) => e.seq > lastSeq.current);
    lastSeq.current = Math.max(lastSeq.current, view.seq);
    const handle = (e: GameEvent) => {
      if (!("captain" in e) || e.captain !== myId) {
        if (e.type === "storm_hit" && e.great) sound.thunder();
        return;
      }
      if (e.type === "bound") {
        sound.coins();
        toast({ kind: "good", title: "Off you go!", sub: `${Math.round(e.covered_bps / 100)}% of your ship is protected` });
        once(pip("capsail"));
        grow("protectedTrips", 10);
      }
      if (e.type === "sailed_bare") {
        toast({ kind: "plain", title: "Off you go!", sub: "No shop is protecting you" });
        once(pip("capsail"));
      }
      if (e.type === "withdrew") toast({ kind: "plain", title: "Trip cancelled", sub: "You sold the cargo back" });
      if (e.type === "home") {
        sound.bell(2);
        sound.jingle("home");
        const made = e.profit;
        toast({ kind: made >= 0 ? "good" : "plain", title: `${made >= 0 ? "+" : "−"}${crowns(Math.abs(made))} coins!`, sub: "Your cargo is sold" });
        setStar({ port: e.port });
        if ((progressRef.current.counts.trips ?? 0) < 2) setMoment({ id: momentId.current++, kind: "home", ship: "", captain: myId, amount: 0, note: "You sold your cargo!" });
        once(pip("caphome"));
        grow("trips", 20, 0, Math.max(0, (me?.cash ?? 0) - (view.helm?.start_cash ?? 0)));
      }
      if (e.type === "wrecked") {
        sound.bell(1);
        sound.thunder();
        sound.jingle("sad");
        setMoment({
          id: momentId.current++,
          kind: "wreck",
          ship: "",
          captain: myId,
          amount: e.sum,
          note: e.sum > 0 ? `The shops owe you ${crowns(e.sum)} coins` : "No shop protected you",
        });
        once(pip("capwreck"));
      }
      if (e.type === "claim_paid") {
        sound.coins();
        toast({ kind: "good", title: `+${crowns(e.paid)} coins!`, sub: "The shops paid for your ship" });
      }
      if (e.type === "fraud") {
        toast({ kind: "bad", title: "You got caught!", sub: `You pay ${crowns(e.reward)} coins` });
        speak(pip("capcaught"));
      }
      if (e.type === "honest_loss") toast({ kind: "plain", title: "A shop looked into your wreck", sub: "They found nothing" });
      if (e.type === "laid_up") speak(pip("capbroke"));
      if (e.type === "refitted") {
        const helper = view.houses[e.house];
        toast({ kind: "good", title: "You got a new ship!", sub: `${helper ? shopName(helper.name) : "A shop"} helped you` });
      }
    };
    fresh.forEach(handle);

    // Shops answering my trip, as they answer.
    const slip = me?.state.state === "seeking" ? view.slips.find((s) => me.state.state === "seeking" && s.id === me.state.slip) : undefined;
    for (const q of slip?.quotes ?? []) {
      const key = `${slip?.id}:${q.house}`;
      if (answered.current.has(key)) continue;
      answered.current.add(key);
      const house = view.houses[q.house];
      if (!house) continue;
      if (house.kind === "player") {
        sound.jingle("star");
        toast({ kind: "good", title: `${house.name} said yes!`, sub: "That's a real player" });
        once(pip("capreal"));
      } else {
        sound.coins();
      }
    }
    previous.current = view;
  }, [view, myId, me, toast, once, speak, grow]);

  useEffect(() => {
    if (me?.state.state !== "at_port" || !view?.helm?.trips.length) return;
    if (told.current.has("cap0") || told.current.has("cap0live")) {
      const timer = window.setTimeout(() => once(pip("cap1")), 5000);
      return () => window.clearTimeout(timer);
    }
  }, [me?.state.state, view?.helm?.trips.length, once]);

  const collectStar = useCallback(() => {
    if (!star) return;
    const f = fitRef.current;
    const x = f.x + PORTS[star.port][0] * f.scale;
    const y = f.y + PORTS[star.port][1] * f.scale;
    const target = document.querySelector(".pill.stars")?.getBoundingClientRect();
    if (target) {
      const group = flyerGroup.current++;
      setFlyers((list) => [...list, { id: group, group, x, y, dx: target.left + 20 - x, dy: target.top + 20 - y, delay: 0 }]);
      window.setTimeout(() => setFlyers((list) => list.filter((g) => g.group !== group)), 1400);
    }
    sound.jingle("star");
    setStar(null);
    grow(null, 10, 1);
  }, [star, grow]);

  // Wind and rain for a storm, a darker tune when it's on my route.
  const weather: sound.Weather = useMemo(() => {
    if (!view || !me) return 0;
    const lane = me.state.state === "sailing" ? view.voyages.find((v) => me.state.state === "sailing" && v.id === me.state.voyage)?.lane : undefined;
    const near = view.storms.filter((s) => s.starts - view.watch <= 2);
    if (near.some((s) => s.great && s.starts <= view.watch) || (lane !== undefined && near.some((s) => s.lanes.includes(lane)))) return 2;
    return near.length ? 1 : 0;
  }, [view, me]);
  useEffect(() => sound.setWeather(weather), [weather]);
  useEffect(() => () => sound.setWeather(0), []);
  const wrecking = moment?.kind === "wreck";
  useEffect(() => sound.duck("wreck", wrecking), [wrecking]);

  const endMoment = useCallback(() => setMoment(null), []);
  const inset = useMemo(() => (narrow ? { left: 0, top: 8, bottom: 8 } : { left: 386, top: 70, bottom: 4 }), [narrow]);

  if (!view || !me) return null;

  const watchMs = practice ? pace || NORMAL_WATCH_MS : view.watch_ms;
  const earned = me.cash - (view.helm?.start_cash ?? me.cash);
  const ranked = [...view.captains].sort((a, b) => b.cash - a.cash);
  const rank = ranked.findIndex((c) => c.id === myId) + 1;

  return (
    <div className="game captain-game">
      <TopBar
        view={view}
        you={undefined}
        coins={me.cash}
        progress={progress}
        paused={pace === 0}
        fast={pace > 0 && pace < NORMAL_WATCH_MS}
        canPace={!!practice}
        onPause={() => setSpeed(0)}
        onPlay={() => setSpeed(NORMAL_WATCH_MS)}
        onFast={() => setSpeed(WEEK_IN_A_MINUTE_MS)}
        onBuild={() => setShopOpen(true)}
        onLedger={() => setLedger(true)}
        onHome={onExit}
      />
      <main className={`sea${moment?.kind === "wreck" ? " shaking" : ""}`}>
        <Chart view={view} driver={driver} flash={0} built={progress.built} level={levelOf(progress.xp).level} inset={inset} onFit={setFit} myCaptain={myId} />
        {star && (
          <button
            className="reward"
            style={{ left: fit.x + PORTS[star.port][0] * fit.scale, top: fit.y + PORTS[star.port][1] * fit.scale }}
            onClick={collectStar}
            aria-label="Collect your star"
          >
            <Star size={50} />
          </button>
        )}
        <Toasts toasts={toasts} />
        <div className="right-rail">
          <Quests progress={progress} coins={Math.max(0, earned)} list={CAPTAIN_QUESTS} />
          <CaptainRace view={view} you={myId} />
        </div>
        {flyers.map((f) => (
          <span key={f.id} className="flyer" style={{ left: f.x, top: f.y, "--dx": `${f.dx}px`, "--dy": `${f.dy}px` } as CSSProperties}>
            <Star size={30} />
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
      <Bridge view={view} me={me} watchMs={watchMs} busy={busy} showTrick={(progress.counts.trips ?? 0) >= 3} act={(a) => void act(a)} />
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
            practice={false}
            onSkip={() => undefined}
            onRunWeek={() => undefined}
            onSpiral={() => undefined}
            onSummon={() => undefined}
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
      {view.intermission !== null && (
        <div className="modal-back" role="dialog" aria-modal="true" aria-label="Harbor Festival">
          <div className="modal center">
            <h2>The Harbor Festival!</h2>
            <p className="lede">
              {fullName(myId)} came number {rank} of {view.captains.length} captains.
            </p>
            <p className="report-line">
              <Coin size={18} /> You {earned >= 0 ? "earned" : "lost"} <b>{crowns(Math.abs(earned))}</b> coins as captain, {name}.
            </p>
            {practice ? (
              <button
                className="big-button"
                onClick={() => {
                  void (async () => {
                    await driver.act({ kind: "next_season" });
                    await driver.act({ kind: "take_helm", name, captain: myId });
                    answered.current.clear();
                    setSpeed(NORMAL_WATCH_MS);
                  })();
                }}
              >
                Play the next season
              </button>
            ) : (
              <p className="working">The next season starts by itself in a moment.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
