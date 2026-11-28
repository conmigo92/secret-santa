import { christmasCountdown } from "../domain/calendar";
import { normalizeName } from "../domain/participants";
import {
  act,
  parseSweater,
  results,
  startSweater,
  SWEATER_CATEGORIES,
  SWEATER_SETTINGS,
  type SweaterAction,
  type SweaterGame,
} from "../domain/sweater";
import { el, hollyMark } from "./dom";
import { mountSiteNav } from "./site-nav";

const KEY = "secret-santa.sweater";

export function mountSweater(root: HTMLElement): void {
  let game = load();
  let names: string[] = [];
  let nameDraft = "";
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
      el("label", { className: "heading", text: "Contestants", attrs: { for: "person-name" } }),
      el("p", { className: "quiet", text: "Everyone in a sweater. They will also vote." }),
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
      if ([...name].length > SWEATER_SETTINGS.nameMax) {
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
    const start = el("button", { className: "primary draw", text: "Start voting", attrs: { type: "button" } });
    start.addEventListener("click", () => {
      const started = startSweater(names);
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
    const shell = el("main", { className: "shell party" }, [header(), form, start]);
    mountSiteNav(shell);
    root.replaceChildren(shell);
  }

  function drawPlay(current: SweaterGame): void {
    const body = [header(), message(error)];
    const phase = current.phase;
    if (phase.kind === "cover") body.push(cover(current, phase.voterIndex));
    else if (phase.kind === "ballot") body.push(ballot(current, phase.voterIndex));
    else if (phase.kind === "sealed") body.push(sealed());
    else body.push(reveal(current));
    body.push(resetButton());
    const shell = el("main", { className: "shell party" }, body);
    mountSiteNav(shell);
    root.replaceChildren(shell);
  }

  function cover(current: SweaterGame, voterIndex: number): HTMLElement {
    const name = current.contestants[voterIndex]?.name ?? "";
    const ready = el("button", { className: "primary", text: `I'm ${name}`, attrs: { type: "button" } });
    ready.addEventListener("click", () => apply({ kind: "ready" }));
    return el("div", { className: "stack" }, [
      el("h2", { text: `Pass the phone to ${name}` }),
      el("p", { className: "quiet", text: "The last vote stays hidden." }),
      ready,
    ]);
  }

  function ballot(current: SweaterGame, voterIndex: number): HTMLElement {
    const voter = current.contestants[voterIndex];
    const choices = current.contestants.filter((person) => person.id !== voter?.id);
    const selects = new Map<string, HTMLSelectElement>();
    const fields: HTMLElement[] = [];
    for (const category of SWEATER_CATEGORIES) {
      const select = el("select", { attrs: { id: `pick-${category.id}` } });
      select.append(el("option", { text: "Choose", attrs: { value: "" } }));
      for (const person of choices) {
        select.append(el("option", { text: person.name, attrs: { value: person.id } }));
      }
      selects.set(category.id, select);
      fields.push(el("div", { className: "field" }, [el("label", { text: category.title, attrs: { for: `pick-${category.id}` } }), select]));
    }
    const form = el("form", { className: "stack" }, [
      el("h2", { text: `${voter?.name ?? ""}, your vote` }),
      el("p", { className: "quiet", text: "You can't vote for yourself. Nobody sees this until the end." }),
      ...fields,
      el("button", { className: "primary", text: "Lock vote", attrs: { type: "submit" } }),
    ]);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const picks = {
        ugliest: selects.get("ugliest")?.value ?? "",
        creative: selects.get("creative")?.value ?? "",
        festive: selects.get("festive")?.value ?? "",
      };
      if (!picks.ugliest || !picks.creative || !picks.festive) {
        error = "Pick someone in every category.";
        draw();
        return;
      }
      apply({ kind: "vote", picks });
    });
    return form;
  }

  function sealed(): HTMLElement {
    const button = el("button", { className: "primary", text: "Reveal winners", attrs: { type: "button" } });
    button.addEventListener("click", () => apply({ kind: "reveal" }));
    return el("div", { className: "stack" }, [
      el("h2", { text: "Votes are in" }),
      el("p", { className: "quiet", text: "Nothing is shown until you reveal." }),
      button,
    ]);
  }

  function reveal(current: SweaterGame): HTMLElement {
    const board = results(current) ?? [];
    const list = el("div", { className: "stack" });
    for (const row of board) {
      list.append(
        el("section", {}, [
          el("h2", { text: row.title }),
          el("p", { className: "winner", text: row.names.join(", ") }),
        ]),
      );
    }
    return list;
  }

  function resetButton(): HTMLButtonElement {
    const button = el("button", {
      className: "ghost",
      text: confirm === "reset" ? "Erase and start over" : "New contest",
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
      nameDraft = "";
      confirm = "";
      error = "";
      draw();
    });
    return button;
  }

  function apply(action: SweaterAction): void {
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
    el("h1", {}, [document.createTextNode("Ugly"), el("span", { text: "Sweater" })]),
    el("p", { className: "lede", text: "Pass the phone. One vote each. The winners stay hidden until the end." }),
    el("p", { className: "countdown", text: christmasCountdown(new Date()) }),
  ]);
}

function message(text: string): HTMLParagraphElement {
  const node = el("p", { className: "alert", text, attrs: { role: "alert" } });
  node.hidden = text.length === 0;
  return node;
}

function load(): SweaterGame | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const game = parseSweater(JSON.parse(raw));
    if (!game) localStorage.removeItem(KEY);
    return game;
  } catch {
    localStorage.removeItem(KEY);
    return null;
  }
}

function store(game: SweaterGame): void {
  localStorage.setItem(KEY, JSON.stringify(game));
}
