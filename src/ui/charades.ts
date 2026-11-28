import {
  act,
  ACT_SETTINGS,
  parseCharades,
  standings,
  startCharades,
  timeUp,
  type ActAction,
  type ActGame,
  type ActMode,
  type Difficulty,
} from "../domain/charades";
import { christmasCountdown } from "../domain/calendar";
import { normalizeName } from "../domain/participants";
import { el, hollyMark } from "./dom";
import { mountSiteNav } from "./site-nav";

const KEY = "secret-santa.charades";

const MODE_LABEL: Record<ActMode, string> = {
  charades: "Act it out. No talking.",
  pictionary: "Draw it. No letters and no talking.",
};

export function mountCharades(root: HTMLElement): void {
  let game = load();
  let names: string[] = [];
  let nameDraft = "";
  let mode: ActMode = "charades";
  let difficulties: Difficulty[] = ["easy", "medium", "hard"];
  let secondsDraft = String(ACT_SETTINGS.seconds.default);
  let error = "";
  let confirm: "" | "end" | "reset" = "";
  let clock = 0;

  draw();

  function draw(): void {
    if (game) drawPlay(game);
    else drawSetup();
    armClock();
  }

  function drawSetup(): void {
    const nameInput = el("input", {
      attrs: {
        id: "team-name",
        name: "team-name",
        type: "text",
        maxlength: "40",
        autocomplete: "off",
        placeholder: "Team",
      },
    });
    nameInput.value = nameDraft;
    nameInput.addEventListener("input", () => {
      nameDraft = nameInput.value;
    });
    const list = el("ul", { className: "rows" });
    for (const [index, name] of names.entries()) {
      const remove = el("button", { className: "ghost", text: "Remove", attrs: { type: "button" } });
      remove.addEventListener("click", () => {
        names = names.filter((_, item) => item !== index);
        error = "";
        draw();
      });
      list.append(el("li", {}, [el("span", { text: name }), remove]));
    }
    const form = el("form", { className: "stack" }, [
      el("label", { className: "heading", text: "Teams", attrs: { for: "team-name" } }),
      el("div", { className: "inline" }, [
        nameInput,
        el("button", { className: "primary", text: "Add", attrs: { type: "submit" } }),
      ]),
      message(error),
      list,
    ]);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const name = normalizeName(nameInput.value);
      if (!name) {
        error = "Enter a name.";
        draw();
        return;
      }
      if ([...name].length > ACT_SETTINGS.nameMax) {
        error = "Use a shorter name (40 characters or fewer).";
        draw();
        return;
      }
      if (names.some((existing) => existing.localeCompare(name, undefined, { sensitivity: "accent" }) === 0)) {
        error = "That name is already on the list.";
        draw();
        return;
      }
      if (names.length >= ACT_SETTINGS.teams.max) {
        error = "Use 8 teams or fewer.";
        draw();
        return;
      }
      names = [...names, name];
      nameDraft = "";
      error = "";
      draw();
    });

    const seconds = el("input", {
      attrs: { id: "seconds", name: "seconds", type: "number", min: "10", max: "180", step: "1", inputmode: "numeric" },
    });
    seconds.value = secondsDraft;
    seconds.addEventListener("input", () => {
      secondsDraft = seconds.value;
    });
    const start = el("button", { className: "primary draw", text: "Start game", attrs: { type: "button" } });
    start.addEventListener("click", () => {
      if (!/^\d+$/.test(secondsDraft.trim())) {
        error = "Set the timer from 10 to 180 seconds.";
        draw();
        return;
      }
      const started = startCharades(
        { names, mode, difficulties, seconds: Number(secondsDraft) },
        Math.random,
        Date.now(),
      );
      if (!started.ok) {
        error = started.reason;
        draw();
        return;
      }
      error = "";
      confirm = "";
      game = started.game;
      store(game);
      draw();
    });

    const shell = el("main", { className: "shell party" }, [
      header(),
      form,
      el("div", { className: "stack" }, [
        modeRow(),
        difficultyRow(),
        el("div", { className: "field" }, [
          el("label", { text: "Seconds", attrs: { for: "seconds" } }),
          seconds,
        ]),
        start,
      ]),
    ]);
    mountSiteNav(shell);
    root.replaceChildren(shell);
  }

  function modeRow(): HTMLElement {
    const row = el("div", { className: "mode-row" });
    for (const item of ["charades", "pictionary"] as const) {
      const button = el("button", {
        className: item === mode ? "primary" : "ghost",
        text: item === "charades" ? "Charades" : "Pictionary",
        attrs: { type: "button", "aria-pressed": item === mode ? "true" : "false" },
      });
      button.addEventListener("click", () => {
        mode = item;
        draw();
      });
      row.append(button);
    }
    return row;
  }

  function difficultyRow(): HTMLElement {
    const row = el("div", { className: "stack" });
    for (const item of ["easy", "medium", "hard"] as const) {
      const input = el("input", { attrs: { type: "checkbox", id: `diff-${item}` } });
      input.checked = difficulties.includes(item);
      input.addEventListener("change", () => {
        difficulties = input.checked ? [...difficulties, item] : difficulties.filter((diff) => diff !== item);
      });
      const label = item[0]!.toUpperCase() + item.slice(1);
      row.append(el("label", { className: "choice" }, [input, el("span", { text: label })]));
    }
    return row;
  }

  function drawPlay(current: ActGame): void {
    const body: HTMLElement[] = [header(), scoreLine(current), message(error), el("p", { className: "quiet", text: MODE_LABEL[current.mode] })];
    if (current.phase.kind === "board") body.push(board(current));
    else body.push(turn(current));
    body.push(resetButton());
    const shell = el("main", { className: "shell party" }, body);
    mountSiteNav(shell);
    root.replaceChildren(shell);
  }

  function turn(current: ActGame): HTMLElement {
    const phase = current.phase;
    if (phase.kind === "board") return el("div");
    const team = current.teams[phase.teamIndex]?.name ?? "";
    const block = el("div", { className: "stack" }, [
      el("h2", { text: `${team}'s turn` }),
      el("p", { className: "timer", text: formatTime(phase.endsAt - Date.now()) }),
      el("p", { className: "quiet", text: phase.card.difficulty[0]!.toUpperCase() + phase.card.difficulty.slice(1) }),
    ]);
    if (phase.kind === "hidden") {
      const show = el("button", { className: "primary", text: "Show word", attrs: { type: "button" } });
      show.addEventListener("click", () => apply({ kind: "reveal" }));
      block.append(el("p", { className: "quiet", text: "The guessers look away." }), show);
    } else {
      block.append(el("p", { className: "secret-word", text: phase.card.word }));
      const got = el("button", { className: "primary", text: "Got it", attrs: { type: "button" } });
      got.addEventListener("click", () => apply({ kind: "score", now: Date.now() }));
      block.append(got);
    }
    const skip = el("button", { className: "ghost", text: "Skip", attrs: { type: "button" } });
    skip.addEventListener("click", () => apply({ kind: "skip" }));
    const next = el("button", { className: "ghost", text: "Next team", attrs: { type: "button" } });
    next.addEventListener("click", () => apply({ kind: "pass", now: Date.now() }));
    block.append(skip, next, endButton());
    return block;
  }

  function board(current: ActGame): HTMLElement {
    const list = el("ol", { className: "turn-order" });
    for (const team of standings(current)) list.append(el("li", { text: `${team.name}, ${team.score}` }));
    return el("div", { className: "stack" }, [el("h2", { text: "Scores" }), list]);
  }

  function scoreLine(current: ActGame): HTMLElement {
    const list = el("ul", { className: "score-row" });
    for (const team of standings(current)) list.append(el("li", { text: `${team.name} ${team.score}` }));
    return list;
  }

  function endButton(): HTMLButtonElement {
    const button = el("button", {
      className: "ghost",
      text: confirm === "end" ? "Show the board" : "End game",
      attrs: { type: "button" },
    });
    button.addEventListener("click", () => {
      if (confirm !== "end") {
        confirm = "end";
        error = "";
        draw();
        return;
      }
      apply({ kind: "end" });
    });
    return button;
  }

  function resetButton(): HTMLButtonElement {
    const button = el("button", {
      className: "ghost",
      text: confirm === "reset" ? "Erase and start over" : "New game",
      attrs: { type: "button" },
    });
    button.addEventListener("click", () => {
      if (confirm !== "reset") {
        confirm = "reset";
        error = "";
        draw();
        return;
      }
      window.clearInterval(clock);
      localStorage.removeItem(KEY);
      game = null;
      names = [];
      nameDraft = "";
      mode = "charades";
      difficulties = ["easy", "medium", "hard"];
      secondsDraft = String(ACT_SETTINGS.seconds.default);
      confirm = "";
      error = "";
      draw();
    });
    return button;
  }

  function apply(action: ActAction): void {
    if (!game) return;
    const result = act(game, action);
    if (!result.ok) {
      error = result.reason;
      draw();
      return;
    }
    error = "";
    confirm = "";
    game = result.game;
    store(game);
    draw();
  }

  function armClock(): void {
    window.clearInterval(clock);
    if (!game || game.phase.kind === "board") return;
    clock = window.setInterval(() => {
      if (!game || game.phase.kind === "board") return;
      const node = root.querySelector(".timer");
      if (node) node.textContent = formatTime(game.phase.endsAt - Date.now());
      if (timeUp(game, Date.now()) && node) node.classList.add("is-up");
    }, 200);
  }
}

function formatTime(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function header(): HTMLElement {
  return el("header", { className: "mast" }, [
    hollyMark(),
    el("h1", {}, [document.createTextNode("Charades"), el("span", { text: "or Draw" })]),
    el("p", { className: "lede", text: "One word for the actor. The team guesses. Keep the score." }),
    el("p", { className: "countdown", text: christmasCountdown(new Date()) }),
  ]);
}

function message(text: string): HTMLParagraphElement {
  const node = el("p", { className: "alert", text, attrs: { role: "alert" } });
  node.hidden = text.length === 0;
  return node;
}

function load(): ActGame | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const game = parseCharades(JSON.parse(raw));
    if (!game) localStorage.removeItem(KEY);
    return game;
  } catch {
    localStorage.removeItem(KEY);
    return null;
  }
}

function store(game: ActGame): void {
  localStorage.setItem(KEY, JSON.stringify(game));
}
