import {
  act,
  AWARD_SETTINGS,
  parseAwards,
  promptText,
  startAwards,
  titles,
  type AwardsAction,
  type AwardsGame,
} from "../domain/awards";
import { christmasCountdown } from "../domain/calendar";
import { normalizeName } from "../domain/participants";
import { el, hollyMark } from "./dom";
import { mountSiteNav } from "./site-nav";

const KEY = "secret-santa.awards";

export function mountAwards(root: HTMLElement): void {
  let game = load();
  let names: string[] = [];
  let nameDraft = "";
  let countDraft = String(AWARD_SETTINGS.count.default);
  let error = "";
  let confirm: "" | "reset" = "";

  draw();

  function draw(): void {
    if (game) drawPlay(game);
    else drawSetup();
  }

  function drawSetup(): void {
    const nameInput = el("input", {
      attrs: { id: "person-name", name: "person-name", type: "text", maxlength: "40", autocomplete: "name", placeholder: "Name" },
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
      el("label", { className: "heading", text: "People", attrs: { for: "person-name" } }),
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
      if ([...name].length > AWARD_SETTINGS.nameMax) {
        error = "Use a shorter name (40 characters or fewer).";
        draw();
        return;
      }
      if (names.some((existing) => existing.localeCompare(name, undefined, { sensitivity: "accent" }) === 0)) {
        error = "That name is already on the list.";
        draw();
        return;
      }
      names = [...names, name];
      nameDraft = "";
      error = "";
      draw();
    });
    const count = el("input", {
      attrs: { id: "count", name: "count", type: "number", min: "1", max: "12", step: "1", inputmode: "numeric" },
    });
    count.value = countDraft;
    count.addEventListener("input", () => {
      countDraft = count.value;
    });
    const start = el("button", { className: "primary draw", text: "Start awards", attrs: { type: "button" } });
    start.addEventListener("click", () => {
      if (!/^\d+$/.test(countDraft.trim())) {
        error = "Set the award count from 1 to 12.";
        draw();
        return;
      }
      const started = startAwards(names, Number(countDraft), Math.random);
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
      el("div", { className: "field" }, [el("label", { text: "Awards", attrs: { for: "count" } }), count]),
      start,
    ]);
    mountSiteNav(shell);
    root.replaceChildren(shell);
  }

  function drawPlay(current: AwardsGame): void {
    const body: HTMLElement[] = [header(), message(error)];
    if (current.phase.kind === "results") body.push(board(current));
    else body.push(turn(current));
    body.push(resetButton());
    const shell = el("main", { className: "shell party" }, body);
    mountSiteNav(shell);
    root.replaceChildren(shell);
  }

  function turn(current: AwardsGame): HTMLElement {
    const phase = current.phase;
    if (phase.kind === "results") return el("div");
    const name = current.people[phase.voterIndex]?.name ?? "";
    const text = promptText(current.prompts[phase.promptIndex] ?? "");
    const block = el("div", { className: "stack" }, [
      el("p", { className: "quiet", text: `Award ${phase.promptIndex + 1} of ${current.prompts.length}` }),
      el("h2", { text: `Most likely to ${text}` }),
    ]);
    if (phase.kind === "cover") {
      const ready = el("button", { className: "primary", text: `I'm ${name}`, attrs: { type: "button" } });
      ready.addEventListener("click", () => apply({ kind: "ready" }));
      block.append(el("p", { className: "quiet", text: `Pass the phone to ${name}.` }), ready);
      return block;
    }
    const picks = el("div", { className: "point-row" });
    for (const person of current.people) {
      const button = el("button", { className: "primary", text: person.name, attrs: { type: "button" } });
      button.addEventListener("click", () => apply({ kind: "vote", choiceId: person.id }));
      picks.append(button);
    }
    block.append(el("p", { className: "quiet", text: `${name}, pick someone.` }), picks);
    return block;
  }

  function board(current: AwardsGame): HTMLElement {
    const rows = titles(current) ?? [];
    const list = el("div", { className: "stack" });
    for (const row of rows) {
      const lines = row.titles.length === 0 ? [el("p", { className: "quiet", text: "None this round." })] : row.titles.map((title) => el("p", { className: "winner", text: `Most likely to ${title}` }));
      list.append(el("section", {}, [el("h2", { text: row.name }), ...lines]));
    }
    return list;
  }

  function resetButton(): HTMLButtonElement {
    const button = el("button", {
      className: "ghost",
      text: confirm === "reset" ? "Erase and start over" : "New awards",
      attrs: { type: "button" },
    });
    button.addEventListener("click", () => {
      if (confirm !== "reset") {
        confirm = "reset";
        error = "";
        draw();
        return;
      }
      localStorage.removeItem(KEY);
      game = null;
      names = [];
      confirm = "";
      error = "";
      draw();
    });
    return button;
  }

  function apply(action: AwardsAction): void {
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
}

function header(): HTMLElement {
  return el("header", { className: "mast" }, [
    hollyMark(),
    el("h1", {}, [document.createTextNode("Most likely"), el("span", { text: "to" })]),
    el("p", { className: "lede", text: "Pass the phone. Each vote is one tap. The titles wait until the end." }),
    el("p", { className: "countdown", text: christmasCountdown(new Date()) }),
  ]);
}

function message(text: string): HTMLParagraphElement {
  const node = el("p", { className: "alert", text, attrs: { role: "alert" } });
  node.hidden = text.length === 0;
  return node;
}

function load(): AwardsGame | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const game = parseAwards(JSON.parse(raw));
    if (!game) localStorage.removeItem(KEY);
    return game;
  } catch {
    localStorage.removeItem(KEY);
    return null;
  }
}

function store(game: AwardsGame): void {
  localStorage.setItem(KEY, JSON.stringify(game));
}
