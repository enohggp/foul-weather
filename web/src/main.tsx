import { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/im-fell-english/400.css";
import "@fontsource/im-fell-english/400-italic.css";
import "@fontsource/im-fell-english-sc/400.css";
import "@fontsource/spectral/400.css";
import "@fontsource/spectral/500.css";
import "@fontsource/spectral/700.css";
import "./styles.css";
import { Engine, PracticeDriver, WEEK_IN_A_MINUTE_MS } from "./engine";
import Game from "./Game";
import { CONTRACT, EXPLORER, LiveDriver } from "./live";
import { SeaWatch, type Reading } from "./seaCore";
import type { Driver } from "./types";
import { Title, type TitleChoice } from "./ui/Overlays";
import type { Hood } from "./ui/Side";

/** A fixed season that always ends in a chain of failures. See scripts/find-spiral.mjs. */
const SPIRAL = { seed: 219, preRoll: 60 };
const SEA_EVERY_MS = 45_000;

interface Session {
  key: number;
  driver: Driver;
  name: string;
  autoplay: boolean;
  spiral: boolean;
}

function App() {
  const [engine, setEngine] = useState<Engine | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [sea, setSea] = useState<Reading[]>([]);
  const [hoodExtra, setHoodExtra] = useState<Pick<Hood, "contract" | "account" | "lastTx">>({ contract: null, account: null, lastTx: null });
  const watcher = useRef(new SeaWatch());
  const keyRef = useRef(1);

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
    driver.setPace(WEEK_IN_A_MINUTE_MS);
    setSession({ key: keyRef.current++, driver, name, autoplay: true, spiral: true });
  }, [engine, session]);

  const start = useCallback(
    (choice: TitleChoice) => {
      setError(null);
      if (choice.mode === "practice") {
        void startPractice(choice.name);
        return;
      }
      void (async () => {
        try {
          const driver = await LiveDriver.connect(choice.name, setWorking);
          driver.onTransaction = (hash) => setHoodExtra((h) => ({ ...h, lastTx: hash }));
          setHoodExtra({ contract: CONTRACT, account: driver.accountId, lastTx: null });
          setSession({ key: keyRef.current++, driver, name: choice.name, autoplay: true, spiral: false });
        } catch (e) {
          setError(e instanceof Error ? e.message : "The Room is not answering. Try practice mode.");
        } finally {
          setWorking(null);
        }
      })();
    },
    [startPractice],
  );

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
    const params = new URLSearchParams(window.location.search);
    if (params.has("demo") && engine && !session) {
      void startPractice("The Judge").then(() => undefined);
    }
  }, [engine, session, startPractice]);

  if (!session) {
    return <Title onStart={start} ready={!!engine} liveReady={true} error={error} working={working} />;
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

createRoot(document.getElementById("root")!).render(<App />);
