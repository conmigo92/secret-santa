import "@fontsource/figtree/latin-400.css";
import "@fontsource/figtree/latin-600.css";
import "@fontsource/mountains-of-christmas/latin-700.css";
import "./style.css";
import "./guide.css";
import { mountSiteNav } from "./ui/site-nav";

const root = document.querySelector("#app");
if (!(root instanceof HTMLElement)) throw new Error("Missing #app");

mountSiteNav(root);
