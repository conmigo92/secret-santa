import "@fontsource/figtree/latin-400.css";
import "@fontsource/figtree/latin-600.css";
import "@fontsource/mountains-of-christmas/latin-700.css";
import "./awards.css";
import "./style.css";
import { mountAwards } from "./ui/awards";
import { pageTitle } from "./site";

const root = document.querySelector("#app");
if (!(root instanceof HTMLElement)) throw new Error("Missing #app");

document.title = pageTitle("Most Likely To");
mountAwards(root);
