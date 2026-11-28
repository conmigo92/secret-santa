import "@fontsource/figtree/latin-400.css";
import "@fontsource/figtree/latin-600.css";
import "@fontsource/mountains-of-christmas/latin-700.css";
import { rootHasRevealHash, secretSantaRevealUrl } from "./domain/root-route";
import "./hub.css";
import { SITE_NAME } from "./site";
import "./style.css";
import { mountHub } from "./ui/hub";

const root = document.querySelector("#app");
if (!(root instanceof HTMLElement)) throw new Error("Missing #app");

if (rootHasRevealHash(location.hash)) {
  location.replace(secretSantaRevealUrl(location.origin, import.meta.env.BASE_URL, location.hash));
} else {
  document.title = SITE_NAME;
  mountHub(root);
}
