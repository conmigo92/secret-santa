import "@fontsource/figtree/latin-400.css";
import "@fontsource/figtree/latin-600.css";
import "@fontsource/mountains-of-christmas/latin-700.css";
import "./style.css";
import "./white-elephant.css";
import { mountWhiteElephant } from "./ui/white-elephant";

const root = document.querySelector("#app");
if (!(root instanceof HTMLElement)) throw new Error("Missing #app");

document.title = "White Elephant";
mountWhiteElephant(root);
