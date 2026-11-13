import { useCallback, useEffect, useRef, useState } from "react";
import CaptainGame from "./CaptainGame";
import { Engine, PracticeDriver, SPIRAL_MS } from "./engine";
import Game from "./Game";
import { readTownSave } from "./progress";
import TownGame from "./TownGame";
import { CONTRACT, EXPLORER, LiveDriver } from "./live";
import { SeaWatch, type Reading } from "./seaCore";
import type { Driver, Role, View } from "./types";
import { beginSignIn, finishSignIn, loginAvailable, returningFromSignIn } from "./auth";
import { connectWallet, savedWallet, type WalletAccount } from "./wallet";
import { Title, type TitleChoice } from "./ui/Overlays";
import RolePick from "./ui/RolePick";
import { dealFor } from "./ui/Visitors";
import type { Hood } from "./ui/Side";

/** A fixed season that always ends in a chain of failures. See scripts/find-spiral.mjs. */
const SPIRAL = { seed: 237, preRoll: 60 };
const SEA_EVERY_MS = 45_000;

interface Session {
  key: number;
  driver: Driver;
  name: string;
  role: Role;
  autoplay: boolean;
  spiral: boolean;
  /** Carrying on from a saved town. */
  resumed?: boolean;
}

/** A player who has said where they want to play, and now chooses who to be. */
interface Choosing {
  name: string;
  view: View | null;
  practice: PracticeDriver | null;
  identity?: string;
}

export default function App() {
  const [engine, setEngine] = useState<Engine | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [choosing, setChoosing] = useState<Choosing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [sea, setSea] = useState<Reading[]>([]);
  const [hoodExtra, setHoodExtra] = useState<Pick<Hood, "contract" | "account" | "wallet" | "lastTx">>({ contract: null, account: null, wallet: false, lastTx: null });
  const watcher = useRef(new SeaWatch());
  const keyRef = useRef(1);
  const demoStarted = useRef(false);

  useEffect(() => {
    Engine.load()
      .then(setEngine)
      .catch(() => setError("The rulebook could not be loaded. Please reload the page."));
  }, []);

  /** Straight into your own town, picking up from where you left off if you've been here before. */
  const startTown = useCallback(
    async (name: string) => {
      if (!engine) return;
      const save = document.body.classList.contains("touring") ? null : readTownSave();
      // For filming: ?film=SEED replays the same luck every time.
      const film = import.meta.env.DEV ? Number(new URLSearchParams(window.location.search).get("film")) || null : null;
      try {
        if (save) {
          const driver = new PracticeDriver(engine, film ?? 0, { saved: save.data, scripted: film !== null });
          setHoodExtra({ contract: null, account: null, wallet: false, lastTx: null });
          setSession({ key: keyRef.current++, driver, name: save.name, role: { kind: "town" }, autoplay: false, spiral: false, resumed: true });
          return;
        }
      } catch {
        // A save from an older version of the rules. Start afresh.
      }
      const driver = new PracticeDriver(engine, film ?? Math.floor(Math.random() * 2 ** 31), { scripted: film !== null });
      await driver.act({ kind: "open_town", name });
      setHoodExtra({ contract: null, account: null, wallet: false, lastTx: null });
      setSession({ key: keyRef.current++, driver, name, role: { kind: "town" }, autoplay: false, spiral: false });
    },
    [engine],
  );

  const startPractice = useCallback(async (driver: PracticeDriver, name: string, role: Role) => {
    if (role.kind === "town") {
      await driver.act({ kind: "open_town", name });
    } else if (role.kind === "shop") {
      await driver.act({ kind: "found_house", name });
      // Start with a safe, well-paid captain at the dock for the first lesson.
      for (let i = 0; i < 40; i++) {
        const you = driver.view.houses.find((h) => h.you);
        if (driver.view.slips.some((s) => s.qty > 0 && dealFor(driver.view, s, you).verdict === "great")) break;
        driver.skip(1);
      }
    } else {
      await driver.act({ kind: "take_helm", name, captain: role.captain });
    }
    setHoodExtra({ contract: null, account: null, wallet: false, lastTx: null });
    setChoosing(null);
    setSession({ key: keyRef.current++, driver, name, role, autoplay: false, spiral: false });
  }, []);

  const newHarbor = useCallback(
    () => (engine ? new PracticeDriver(engine, Math.floor(Math.random() * 2 ** 31)) : null),
    [engine],
  );

  const startSpiral = useCallback(async () => {
    if (!engine) return;
    session?.driver.stop();
    const driver = new PracticeDriver(engine, SPIRAL.seed, { scripted: true, preRoll: SPIRAL.preRoll });
    const name = session?.name ?? "The Observer";
    await driver.act({ kind: "found_house", name });
    await driver.act({ kind: "set_clerk", on: true });
    await driver.act({ kind: "summon_storm" });
    driver.setPace(SPIRAL_MS);
    setSession({ key: keyRef.current++, driver, name, role: { kind: "shop" }, autoplay: true, spiral: true });
  }, [engine, session]);

  const joinLive = useCallback(async (name: string, role: Role, identity?: string, own?: WalletAccount) => {
    try {
      const driver = await LiveDriver.connect(name, setWorking, role, identity, own);
      driver.onTransaction = (hash) => setHoodExtra((h) => ({ ...h, lastTx: hash }));
      setHoodExtra({ contract: CONTRACT, account: driver.accountId, wallet: driver.ownWallet, lastTx: null });
      setChoosing(null);
      setSession({ key: keyRef.current++, driver, name, role, autoplay: true, spiral: false });
    } catch (e) {
      setError(e instanceof Error ? e.message : "The harbor is not answering. Try practice mode.");
    } finally {
      setWorking(null);
    }
  }, []);

  /** A first look at the live town, so the player can see who's there. */
  const chooseLive = useCallback(async (name: string, identity?: string) => {
    setWorking("Looking at the harbor…");
    const view = await LiveDriver.peek().catch(() => null);
    setWorking(null);
    if (!view) {
      setError("The harbor is not answering. Try practice mode.");
      return;
    }
    setChoosing({ name, view, practice: null, identity });
  }, []);

  const start = useCallback(
    (choice: TitleChoice) => {
      setError(null);
      if (choice.mode === "town") {
        void startTown(choice.name);
      } else if (choice.mode === "classic") {
        const driver = newHarbor();
        if (driver) setChoosing({ name: choice.name, view: driver.view, practice: driver });
      } else if (choice.mode === "classic-live") {
        void chooseLive(choice.name);
      } else if (choice.mode === "login") {
        setWorking("Taking you to sign in…");
        beginSignIn(choice.name).catch(() => {
          setWorking(null);
          setError("The sign-in page could not be opened. You can still join as a guest.");
        });
      } else if (choice.mode === "wallet") {
        setWorking("Opening your wallet…");
        connectWallet(setWorking)
          .then((account) => joinLive(choice.name, { kind: "town" }, undefined, account))
          .catch((e: unknown) => {
            setWorking(null);
            const message = e instanceof Error ? e.message : "";
            setError(
              /reject|cancel|closed|denied/i.test(message) || !message
                ? "The wallet didn't connect. You can try again, or play as a guest."
                : message,
            );
          });
      } else {
        setWorking("Heading down to the harbor…");
        void joinLive(choice.name, { kind: "town" });
      }
    },
    [newHarbor, chooseLive, startTown, joinLive],
  );

  const pick = useCallback(
    (role: Role) => {
      if (!choosing) return;
      setError(null);
      if (choosing.practice) void startPractice(choosing.practice, choosing.name, role);
      else void joinLive(choosing.name, role, choosing.identity);
    },
    [choosing, startPractice, joinLive],
  );

  // Coming back from the sign-in page.
  useEffect(() => {
    if (!returningFromSignIn() || demoStarted.current) return;
    demoStarted.current = true;
    setWorking("Finishing your sign-in…");
    finishSignIn()
      .then(({ name, identity }) => joinLive(name, { kind: "town" }, identity))
      .catch((e: unknown) => {
        setWorking(null);
        setError(e instanceof Error ? e.message : "The sign-in did not finish. Please try again.");
      });
  }, [joinLive]);

  // Live sea reports. They shape the water in practice harbors too.
  useEffect(() => {
    let cancelled = false;
    const read = async () => {
      try {
        const readings = await watcher.current.read();
        if (cancelled || !readings) return;
        setSea(readings);
        const driver = session?.driver;
        if (driver instanceof PracticeDriver && !session?.spiral) driver.sea(readings.map((r) => r.sea));
      } catch {
        // No live report: the sea keeps drifting by itself.
      }
    };
    void read();
    const timer = window.setInterval(() => void read(), SEA_EVERY_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [session]);

  useEffect(() => {
    // Direct links for judges: ?demo=play, ?demo=shop, ?demo=captain and ?demo=spiral skip the title screen.
    const demo = new URLSearchParams(window.location.search).get("demo");
    if (!demo || !engine || session || demoStarted.current) return;
    demoStarted.current = true;
    if (demo === "spiral") {
      void startSpiral();
      return;
    }
    const driver = newHarbor();
    if (!driver) return;
    const role: Role = demo === "captain" ? { kind: "captain", captain: 0 } : demo === "shop" ? { kind: "shop" } : { kind: "town" };
    void startPractice(driver, role.kind === "town" ? "Judge's Harbor" : "The Judge", role);
  }, [engine, session, startPractice, startSpiral, newHarbor]);

  const exit = () => {
    session?.driver.stop();
    setSession(null);
    setChoosing(null);
    setWorking(null);
  };

  if (!session) {
    if (choosing) {
      return <RolePick view={choosing.view} live={!choosing.practice} working={working} error={error} onPick={pick} onBack={() => setChoosing(null)} onLive={choosing.practice ? () => start({ mode: "classic-live", name: choosing.name }) : undefined} />;
    }
    return <Title onStart={start} ready={!!engine} liveReady={true} loginReady={loginAvailable()} walletName={savedWallet()?.accountId ?? null} error={error} working={working} />;
  }

  const hood: Hood = {
    ...hoodExtra,
    sea,
    seaUpdated: sea.length ? Date.now() : null,
    explorer: EXPLORER,
  };

  if (session.role.kind === "town") {
    return <TownGame key={session.key} driver={session.driver} name={session.name} hood={hood} resumed={!!session.resumed} onExit={exit} onSpiral={() => void startSpiral()} />;
  }

  if (session.role.kind === "captain") {
    return <CaptainGame key={session.key} driver={session.driver} name={session.name} captain={session.role.captain} hood={hood} onExit={exit} />;
  }

  return (
    <Game
      key={session.key}
      driver={session.driver}
      houseName={session.name}
      hood={hood}
      autoplay={session.autoplay}
      spiral={session.spiral}
      onSpiral={() => void startSpiral()}
      onExit={exit}
    />
  );
}
