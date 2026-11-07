import { createRoot } from "react-dom/client";
import "@fontsource/im-fell-english/400.css";
import "@fontsource/im-fell-english/400-italic.css";
import "@fontsource/im-fell-english-sc/400.css";
import "@fontsource/spectral/400.css";
import "@fontsource/spectral/500.css";
import "@fontsource/spectral/700.css";
import "./styles.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(<App />);