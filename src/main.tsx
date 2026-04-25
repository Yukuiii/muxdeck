import { createRoot } from "react-dom/client";
import "./styles.css";
import { App } from "./ui/App";

const root = document.querySelector<HTMLDivElement>("#app");

if (!root) {
  throw new Error("Muxdeck root element is missing.");
}

createRoot(root).render(<App />);
