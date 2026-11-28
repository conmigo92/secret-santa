import { christmasCountdown } from "../domain/calendar";
import { act, parseRather, promptAt, startRather, type RatherAction, type RatherGame } from "../domain/rather";
import { el, hollyMark } from "./dom";
import { mountSiteNav } from "./site-nav";

const KEY = "secret-santa.rather";

export function mountRather(root: HTMLElement): void {
  let game = load() ?? begin();
  draw();

  function begin(): RatherGame {
    const started = startRather(Math.random);
    localStorage.setItem(KEY, JSON.stringify(started));
    return started;
  }

  function draw(): void {
    const prompt = promptAt(game);
    const body: HTMLElement[] = [header()];
    if (!prompt || game.done) {
      body.push(el("h2", { text: "That's the pile" }), resetButton("Shuffle again"));
    } else {
      body.push(
        el("p", { className: "quiet", text: `${game.index + 1} of ${game.order.length}` }),
        side("left", prompt.left),
        el("p", { className: "or", text: "or" }),
        side("right", prompt.right),
      );
      const next = el("button", { className: "ghost", text: "Next", attrs: { type: "button" } });
      next.addEventListener("click", () => apply({ kind: "next" }));
      body.push(next, resetButton("Shuffle again"));
    }
    const shell = el("main", { className: "shell party" }, body);
    mountSiteNav(shell);
    root.replaceChildren(shell);
  }

  function side(which: "left" | "right", label: string): HTMLElement {
    const add = el("button", {
      className: "choice-card",
      text: label,
      attrs: { type: "button" },
    });
    add.addEventListener("click", () => apply({ kind: "hand", side: which, delta: 1 }));
    const minus = el("button", { className: "ghost", text: "Minus", attrs: { type: "button" } });
    minus.addEventListener("click", () => apply({ kind: "hand", side: which, delta: -1 }));
    return el("div", { className: "hand" }, [
      add,
      el("p", { className: "tally", text: String(game[which]) }),
      minus,
    ]);
  }

  function resetButton(label: string): HTMLButtonElement {
    const button = el("button", { className: "ghost", text: label, attrs: { type: "button" } });
    button.addEventListener("click", () => {
      localStorage.removeItem(KEY);
      game = begin();
      draw();
    });
    return button;
  }

  function apply(action: RatherAction): void {
    const result = act(game, action);
    if (!result.ok) return;
    game = result.game;
    localStorage.setItem(KEY, JSON.stringify(game));
    draw();
  }
}

function header(): HTMLElement {
  return el("header", { className: "mast" }, [
    hollyMark(),
    el("h1", {}, [document.createTextNode("Would you"), el("span", { text: "rather" })]),
    el("p", { className: "lede", text: "Read it out. Count the hands. Then the next one." }),
    el("p", { className: "countdown", text: christmasCountdown(new Date()) }),
  ]);
}

function load(): RatherGame | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return parseRather(JSON.parse(raw));
  } catch {
    return null;
  }
}
