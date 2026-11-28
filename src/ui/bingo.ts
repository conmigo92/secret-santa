import { christmasCountdown } from "../domain/calendar";
import {
  bingoLines,
  cardFromSeed,
  cardUrl,
  decodeCard,
  encodeCard,
  freshMarks,
  hasBingo,
  newSeed,
  toggleMark,
  type BingoCard,
} from "../domain/bingo";
import { el, hollyMark } from "./dom";
import { mountSiteNav } from "./site-nav";

const HOST_KEY = "secret-santa.bingo.host";

export function mountBingo(root: HTMLElement): void {
  const token = readToken();
  if (!token) {
    mountHost(root);
    return;
  }
  const seed = decodeCard(token);
  const card = seed ? cardFromSeed(seed) : null;
  if (!card) {
    mountBroken(root);
    return;
  }
  mountCard(root, card);
}

function mountHost(root: HTMLElement): void {
  let seeds = loadSeeds();
  draw();

  function draw(): void {
    const list = el("ul", { className: "rows links" });
    for (const seed of seeds) {
      const token = encodeCard(seed);
      const card = cardFromSeed(seed);
      if (!token || !card) continue;
      const url = cardUrl(token, location.origin, import.meta.env.BASE_URL);
      const input = el("input", { attrs: { type: "text", readonly: "true", value: url } });
      const open = el("a", { className: "primary", text: "Open", attrs: { href: url } });
      list.append(el("li", {}, [el("span", { className: "who", text: `Card ${seed.slice(0, 4)}` }), input, open]));
    }
    const make = el("button", { className: "primary draw", text: "New card", attrs: { type: "button" } });
    make.addEventListener("click", () => {
      seeds = [...seeds, newSeed()];
      localStorage.setItem(HOST_KEY, JSON.stringify(seeds));
      draw();
    });
    const shell = el("main", { className: "shell party" }, [
      header("Make a card for each player. The link is the card."),
      make,
      seeds.length === 0 ? el("p", { className: "quiet", text: "No cards yet." }) : list,
    ]);
    mountSiteNav(shell);
    root.replaceChildren(shell);
  }
}

function mountCard(root: HTMLElement, card: BingoCard): void {
  let marked = loadMarks(card.seed);
  draw();

  function draw(): void {
    const wins = new Set(bingoLines(marked).flat());
    const grid = el("div", { className: "bingo-grid" });
    card.squares.forEach((square, index) => {
      const button = el("button", {
        className: marked[index] ? "marked" : "",
        text: square,
        attrs: { type: "button", "aria-pressed": marked[index] ? "true" : "false" },
      });
      if (wins.has(index)) button.classList.add("on-line");
      if (index === 12) button.disabled = true;
      button.addEventListener("click", () => {
        const next = toggleMark(marked, index);
        if (!next) return;
        marked = next;
        localStorage.setItem(markKey(card.seed), JSON.stringify(marked));
        draw();
      });
      grid.append(button);
    });
    const print = el("button", { className: "ghost no-print", text: "Print this card", attrs: { type: "button" } });
    print.addEventListener("click", () => window.print());
    const shell = el("main", { className: "shell party" }, [
      header("Tap a square when it happens."),
      hasBingo(marked) ? el("p", { className: "bingo-call", text: "Bingo" }) : el("p", { className: "quiet", text: "Five in a row." }),
      grid,
      print,
    ]);
    mountSiteNav(shell);
    root.replaceChildren(shell);
  }
}

function mountBroken(root: HTMLElement): void {
  const shell = el("main", { className: "shell party" }, [
    header("This card link doesn't open."),
    el("a", { className: "primary", text: "Make a card", attrs: { href: import.meta.env.BASE_URL + "bingo/" } }),
  ]);
  mountSiteNav(shell);
  root.replaceChildren(shell);
}

function header(lede: string): HTMLElement {
  return el("header", { className: "mast" }, [
    hollyMark(),
    el("h1", {}, [document.createTextNode("Holiday"), el("span", { text: "Bingo" })]),
    el("p", { className: "lede", text: lede }),
    el("p", { className: "countdown", text: christmasCountdown(new Date()) }),
  ]);
}

function readToken(): string {
  if (location.hash.length <= 1) return "";
  try {
    return decodeURIComponent(location.hash.slice(1));
  } catch {
    return location.hash.slice(1);
  }
}

function loadSeeds(): string[] {
  try {
    const raw = localStorage.getItem(HOST_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string" && cardFromSeed(item) !== null);
  } catch {
    return [];
  }
}

function loadMarks(seed: string): boolean[] {
  const blank = freshMarks();
  try {
    const raw = localStorage.getItem(markKey(seed));
    if (!raw) return blank;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length !== 25 || parsed.some((item) => typeof item !== "boolean")) return blank;
    const marks = parsed.slice();
    marks[12] = true;
    return marks;
  } catch {
    return blank;
  }
}

function markKey(seed: string): string {
  return `secret-santa.bingo.marks.${seed}`;
}
