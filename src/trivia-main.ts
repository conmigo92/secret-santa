import "@fontsource/figtree/latin-400.css";
import "@fontsource/figtree/latin-600.css";
import "@fontsource/mountains-of-christmas/latin-700.css";
import "./style.css";
import "./trivia.css";
import { pageTitle } from "./site";
import { mountTrivia } from "./ui/trivia";

const root = document.querySelector("#app");
if (!(root instanceof HTMLElement)) throw new Error("Missing #app");

document.title = pageTitle("Christmas Trivia");
mountTrivia(root);
