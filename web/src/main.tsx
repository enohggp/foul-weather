import { createRoot } from "react-dom/client";
import "@fontsource/fredoka/400.css";
import "@fontsource/fredoka/500.css";
import "@fontsource/fredoka/600.css";
import "@fontsource/fredoka/700.css";
import "./styles.css";
import App from "./App";
import { startBackground } from "./audio";

createRoot(document.getElementById("root")!).render(<App />);

for (const gesture of ["pointerup", "touchend", "click", "keydown"]) {
  window.addEventListener(gesture, startBackground, { passive: true });
}
