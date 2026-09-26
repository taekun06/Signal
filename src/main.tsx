import { render } from "preact";
import "@fontsource/vt323";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/600.css";
import "./styles.css";
import { App } from "./ui/App";

render(<App />, document.getElementById("app")!);
