import { render } from "preact";
import "@fontsource/vt323";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/600.css";
import "./styles.css";
import { registerServiceWorker } from "./fx/device";
import { App } from "./ui/App";

registerServiceWorker();
render(<App />, document.getElementById("app")!);
