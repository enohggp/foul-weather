// Small pieces shared by the shop screen and the captain's screen.

import { useEffect, useState } from "react";
import type { Driver, View } from "./types";

export function useView(driver: Driver) {
  const [view, setView] = useState<View | null>(null);
  useEffect(() => driver.subscribe(setView), [driver]);
  return view;
}

export function useNarrow() {
  const [narrow, setNarrow] = useState(() => window.innerWidth < 900);
  useEffect(() => {
    const check = () => setNarrow(window.innerWidth < 900);
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return narrow;
}
