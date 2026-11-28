import { SITE_NAME } from "../site";
import { bowMark, el } from "./dom";
import { gameLinks } from "./game-catalog";
import { mountSiteNav } from "./site-nav";

export function mountHub(root: HTMLElement): void {
  const base = import.meta.env.BASE_URL;
  const cards = el("ul", { className: "game-cards" });
  for (const game of gameLinks()) {
    cards.append(
      el("li", { className: "game-card" }, [
        el("h2", { text: game.label }),
        el("p", { text: game.pitch }),
        el("div", { className: "card-actions" }, [
          el("a", {
            className: "primary",
            text: "Play",
            attrs: { href: `${base}${game.href}` },
          }),
          el("a", {
            className: "how",
            text: "How to play",
            attrs: { href: `${base}${game.guide}` },
          }),
        ]),
      ]),
    );
  }

  const shell = el("main", { className: "shell hub" }, [
    el("div", { className: "game-box" }, [
      el("div", { className: "lid-window", attrs: { "aria-hidden": "true" } }, [
        el("div", { className: "box-lid" }, [bowMark()]),
      ]),
      el("div", { className: "box-body" }, [
        el("header", { className: "mast" }, [
          el("h1", { text: SITE_NAME }),
          el("p", {
            className: "lede",
            text: "Pick a game and play in this browser. Nobody needs an account.",
          }),
        ]),
        cards,
      ]),
    ]),
  ]);
  mountSiteNav(shell);
  root.replaceChildren(shell);
}
