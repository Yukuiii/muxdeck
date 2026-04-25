import "./styles.css";
import { AppController } from "./ui/App";

const root = document.querySelector<HTMLDivElement>("#app");

if (!root) {
  throw new Error("Muxdeck root element is missing.");
}

const app = new AppController(root);

void app.start();
