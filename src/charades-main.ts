import "@fontsource/figtree/latin-400.css";
import "@fontsource/figtree/latin-600.css";
import "@fontsource/mountains-of-christmas/latin-700.css";
import "./charades.css";
import "./style.css";
import { pageTitle } from "./site";
import { mountCharades } from "./ui/charades";

const root = document.querySelector("#app");
if (!(root instanceof HTMLElement)) throw new Error("Missing #app");

document.title = pageTitle("Charades");
mountCharades(root);
