import { useCallback, useEffect, useRef, useState } from "react";
import { Engine, PracticeDriver, SPIRAL_MS } from "./engine";
import Game from "./Game";
import { CONTRACT, EXPLORER, LiveDriver } from "./live";
import { SeaWatch, type Reading } from "./seaCore";
import type { Driver } from "./types";
import { beginSignIn, finishSignIn, loginAvailable, returningFromSignIn } from "./auth";
import { Title, type TitleChoice } from "./ui/Overlays";
import { dealFor } from "./ui/Visitors";
import type { Hood } from "./ui/Side";

/** A fixed season that always ends in a chain of failures. See scripts/find-spiral.mjs. */
const SPIRAL = { seed: 573, preRoll: 60 };
const SEA_EVERY_MS = 45_000;

interface Session {
  key: number;
  driver: Driver;
  name: string;
  autoplay: boolean;
  spiral: boolean;
}

export default function App() {
  const [engine, setEngine] = useState<Engine | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [sea, setSea] = useState<Reading[]>([]);
  const [hoodExtra, setHoodExtra] = useState<Pick<Hood, "contract" | "account" | "lastTx">>({ contract: null, account: null, lastTx: null });
  const watcher = useRef(new SeaWatch());
  const keyRef = useRef(1);
  const demoStarted = useRef(false);

  useEffect(() => {
    Engine.load()
      .then(setEngine)
      .catch(() => setError("The rulebook could not be loaded. Please reload the page."));
  }, []);

  const startPractice = useCallback(
    async (name: string) => {
      if (!engine) return;
      const driver = new PracticeDriver(engine, Math.floor(Math.random() * 2 ** 31));
      await driver.act({ kind: "found_house", name });
      // Start with a safe, well-paid captain at the dock for the first lesson.
      for (let i = 0; i < 40; i++) {
        const you = driver.view.houses.find((h) => h.you);
        if (driver.view.slips.some((s) => s.qty > 0 && dealFor(driver.view, s, you).verdict === "great")) break;
        driver.skip(1);
      }
      setHoodExtra({ contract: null, account: null, lastTx: null });
      setSession({ key: keyRef.current++, driver, name, autoplay: false, spiral: false });
    },
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
    setSession({ key: keyRef.current++, driver, name, autoplay: true, spiral: true });
  }, [engine, session]);

  const joinLive = useCallback(async (name: string, identity?: string) => {
    try {
      const driver = await LiveDriver.connect(name, setWorking, identity);
      driver.onTransaction = (hash) => setHoodExtra((h) => ({ ...h, lastTx: hash }));
      setHoodExtra({ contract: CONTRACT, account: driver.accountId, lastTx: null });
      setSession({ key: keyRef.current++, driver, name, autoplay: true, spiral: false });
    } catch (e) {
      setError(e instanceof Error ? e.message : "The Room is not answering. Try practice mode.");
    } finally {
      setWorking(null);
    }
  }, []);

  const start = useCallback(
    (choice: TitleChoice) => {
      setError(null);
      if (choice.mode === "practice") {
        void startPractice(choice.name);
      } else if (choice.mode === "login") {
        setWorking("Taking you to sign in…");
        beginSignIn(choice.name).catch(() => {
          setWorking(null);
          setError("The sign-in page could not be opened. You can still join as a guest.");
        });
      } else {
        void joinLive(choice.name);
      }
    },
    [startPractice, joinLive],
  );

  // Coming back from the sign-in page.
  useEffect(() => {
    if (!returningFromSignIn() || demoStarted.current) return;
    demoStarted.current = true;
    setWorking("Finishing your sign-in…");
    finishSignIn()
      .then(({ name, identity }) => joinLive(name, identity))
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
    // Direct links for judges: ?demo=spiral and ?demo=play skip the title screen.
    const demo = new URLSearchParams(window.location.search).get("demo");
    if (!demo || !engine || session || demoStarted.current) return;
    demoStarted.current = true;
    if (demo === "spiral") void startSpiral();
    else void startPractice("The Judge");
  }, [engine, session, startPractice, startSpiral]);

  if (!session) {
    return <Title onStart={start} ready={!!engine} liveReady={true} loginReady={loginAvailable()} error={error} working={working} />;
  }

  const hood: Hood = {
    ...hoodExtra,
    sea,
    seaUpdated: sea.length ? Date.now() : null,
    explorer: EXPLORER,
  };

  return (
    <Game
      key={session.key}
      driver={session.driver}
      houseName={session.name}
      hood={hood}
      autoplay={session.autoplay}
      spiral={session.spiral}
      onSpiral={() => void startSpiral()}
      onExit={() => {
        session.driver.stop();
        setSession(null);
        setWorking(null);
      }}
    />
  );
}


