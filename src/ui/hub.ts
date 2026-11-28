import { SITE_NAME } from "../site";
import { bowMark, el } from "./dom";
import { gameLinks } from "./game-catalog";
import { mountSiteNav } from "./site-nav";

export function mountHub(root: HTMLElement): void {
  const base = import.meta.env.BASE_URL;
  const cards = el("ul", { className: "game-cards" });
  gameLinks().forEach((game, index) => {
    const card = el("li", { className: "card-slot" }, [
      el("div", { className: "game-card" }, [
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
    ]);
    card.style.setProperty("--i", String(index));
    cards.append(card);
  });

  const replay = el("button", {
    className: "open-again",
    text: "Open again",
    attrs: { type: "button" },
  });
  const box = el("div", { className: "game-box is-opening" }, [
    el("div", { className: "gift-wrap", attrs: { "aria-hidden": "true" } }, [
      el("div", { className: "box-front" }),
      el("div", { className: "box-lid" }, [el("div", { className: "bow-seat" }, [bowMark()])]),
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
      replay,
    ]),
  ]);
  replay.addEventListener("click", () => restartOpening(box));

  const shell = el("main", { className: "shell hub" }, [box]);
  mountSiteNav(shell);
  root.replaceChildren(el("div", { className: "hub-clip" }, [shell]));
}

function restartOpening(box: HTMLElement): void {
  box.classList.remove("is-opening");
  void box.offsetWidth;
  box.classList.add("is-opening");
}
