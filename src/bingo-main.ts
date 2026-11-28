import "@fontsource/figtree/latin-400.css";
import "@fontsource/figtree/latin-600.css";
import "@fontsource/mountains-of-christmas/latin-700.css";
import "./bingo.css";
import "./style.css";
import { pageTitle } from "./site";
import { mountBingo } from "./ui/bingo";

const root = document.querySelector("#app");
if (!(root instanceof HTMLElement)) throw new Error("Missing #app");

document.title = pageTitle("Holiday Bingo");
mountBingo(root);
window.addEventListener("hashchange", () => {
  document.title = pageTitle("Holiday Bingo");
  mountBingo(root);
});
