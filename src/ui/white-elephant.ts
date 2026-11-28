import { christmasCountdown } from "../domain/calendar";
import { normalizeName } from "../domain/participants";
import {
  act,
  parseElephant,
  startElephant,
  type ElephantAction,
  type ElephantGame,
  type ElephantGift,
} from "../domain/white-elephant";
import { el, hollyMark } from "./dom";
import { mountSiteNav } from "./site-nav";

const KEY = "secret-santa.white-elephant";

export function mountWhiteElephant(root: HTMLElement): void {
  let game = load();
  let names: string[] = [];
  let nameDraft = "";
  let limitValue = "3";
  let finalSwapOn = true;
  let labelDraft = "";
  let armed = false;
  let error = "";

  draw();

  function draw(): void {
    if (game) drawPlay(game);
    else drawSetup();
  }

  function drawSetup(): void {
    const nameInput = el("input", {
      attrs: {
        id: "player-name",
        name: "player-name",
        type: "text",
        maxlength: "40",
        autocomplete: "name",
        placeholder: "Name",
      },
    });
    nameInput.value = nameDraft;
    nameInput.addEventListener("input", () => {
      nameDraft = nameInput.value;
    });

    const limitInput = el("input", {
      attrs: {
        id: "steal-limit",
        name: "steal-limit",
        type: "number",
        min: "1",
        max: "9",
        step: "1",
        inputmode: "numeric",
      },
    });
    limitInput.value = limitValue;
    limitInput.addEventListener("input", () => {
      limitValue = limitInput.value;
    });

    const finalSwap = el("input", { attrs: { id: "final-swap", type: "checkbox" } });
    finalSwap.checked = finalSwapOn;
    finalSwap.addEventListener("change", () => {
      finalSwapOn = finalSwap.checked;
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
      el("label", { className: "heading", text: "Players", attrs: { for: "player-name" } }),
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
      if ([...name].length > 40) {
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

    const start = el("button", { className: "primary draw", text: "Start game", attrs: { type: "button" } });
    start.addEventListener("click", () => {
      const started = startElephant(
        names,
        { stealLimit: Number(limitInput.value), finalSwap: finalSwap.checked },
        Math.random,
      );
      if (!started.ok) {
        error = started.reason;
        draw();
        return;
      }
      error = "";
      armed = false;
      store(started.game);
      game = started.game;
      draw();
    });

    const shell = el("main", { className: "shell party" }, [
      header(),
      form,
      el("div", { className: "stack" }, [
        el("div", { className: "field" }, [
          el("label", { text: "Steal limit", attrs: { for: "steal-limit" } }),
          limitInput,
          el("p", { className: "quiet", text: "A gift locks after this many steals." }),
        ]),
        el("label", { className: "choice" }, [finalSwap, el("span", { text: "Player 1 gets a final swap" })]),
        start,
      ]),
    ]);
    mountSiteNav(shell);
    root.replaceChildren(shell);
    nameInput.focus();
  }

  function drawPlay(current: ElephantGame): void {
    const orderList = el("ol", { className: "turn-order" });
    for (const player of [...current.players].sort((a, b) => a.order - b.order)) {
      orderList.append(el("li", { text: player.name }));
    }

    const body: HTMLElement[] = [
      el("h2", { text: "Turn order" }),
      orderList,
      el("h2", { text: heading(current) }),
      message(error),
    ];

    if (current.phase.kind === "playing") body.push(openForm());
    if (current.phase.kind === "finalSwap") {
      const keep = el("button", { className: "primary", text: "Keep your gift", attrs: { type: "button" } });
      keep.addEventListener("click", () => apply({ kind: "keep" }));
      body.push(keep);
    }
    body.push(giftList(current));
    const reset = resetButton();
    reset.classList.add("end-game");
    body.push(reset);

    const shell = el("main", { className: "shell party" }, [
      header(),
      el("div", { className: "stack" }, body),
    ]);
    mountSiteNav(shell);
    root.replaceChildren(shell);
    if (current.phase.kind === "playing") {
      const label = shell.querySelector("#gift-label");
      if (label instanceof HTMLInputElement) label.focus();
    }
  }

  function openForm(): HTMLFormElement {
    const input = el("input", {
      attrs: { id: "gift-label", name: "gift-label", type: "text", maxlength: "40", autocomplete: "off" },
    });
    input.value = labelDraft;
    input.addEventListener("input", () => {
      labelDraft = input.value;
    });
    const form = el("form", { className: "open-form" }, [
      el("label", { text: "What was inside?", attrs: { for: "gift-label" } }),
      input,
      el("button", { className: "primary", text: "Open gift", attrs: { type: "submit" } }),
    ]);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      apply({ kind: "open", label: input.value });
    });
    return form;
  }

  function giftList(current: ElephantGame): HTMLElement {
    if (current.phase.kind === "done") {
      const list = el("ul", { className: "rows" });
      for (const player of [...current.players].sort((a, b) => a.order - b.order)) {
        const gift = current.gifts.find((item) => item.holderId === player.id);
        if (!gift) continue;
        const locked = gift.steals >= current.rules.stealLimit;
        const line = `${player.name} got ${gift.label}.`;
        list.append(el("li", { text: locked ? `${line} Locked` : line }));
      }
      return list;
    }
    if (current.gifts.length === 0) return el("p", { className: "quiet", text: "Nothing to steal yet." });

    const list = el("ul", { className: "rows" });
    for (const gift of visibleGifts(current)) list.append(giftRow(current, gift));
    return list;
  }

  function giftRow(current: ElephantGame, gift: ElephantGift): HTMLLIElement {
    const phase = current.phase;
    const holderName = current.players.find((player) => player.id === gift.holderId)?.name ?? "";
    const row = el("div", { className: "gift-line" }, [
      el("span", { text: `${holderName} has ${gift.label}` }),
    ]);
    if (phase.kind === "done" || (phase.kind === "finalSwap" && gift.holderId === phase.currentId)) {
      return el("li", {}, [row]);
    }
    const locked = gift.steals >= current.rules.stealLimit;
    const banned = phase.kind === "playing" && phase.bannedGiftId === gift.id;
    if (locked) row.append(el("span", { className: "badge", text: "Locked" }));
    else if (banned) row.append(el("span", { className: "quiet", text: "Can't take this one back" }));
    else {
      const label = phase.kind === "finalSwap" ? "Swap" : "Steal";
      const button = el("button", { className: "primary", text: label, attrs: { type: "button" } });
      button.addEventListener("click", () => apply({ kind: "steal", giftId: gift.id }));
      row.append(button);
    }
    return el("li", {}, [row]);
  }

  function apply(action: ElephantAction): void {
    if (!game) return;
    const result = act(game, action);
    if (!result.ok) {
      error = result.reason;
      draw();
      return;
    }
    error = "";
    armed = false;
    labelDraft = "";
    game = result.game;
    store(game);
    draw();
  }

  function resetButton(): HTMLButtonElement {
    const button = el("button", {
      className: "ghost",
      text: armed ? "Erase and start over" : "New game",
      attrs: { type: "button" },
    });
    button.addEventListener("click", () => {
      if (!armed) {
        armed = true;
        error = "";
        draw();
        return;
      }
      localStorage.removeItem(KEY);
      game = null;
      names = [];
      nameDraft = "";
      labelDraft = "";
      limitValue = "3";
      finalSwapOn = true;
      armed = false;
      error = "";
      draw();
    });
    return button;
  }
}

function visibleGifts(current: ElephantGame): ElephantGift[] {
  const phase = current.phase;
  if (phase.kind !== "finalSwap") return [...current.gifts];
  const own = current.gifts.filter((gift) => gift.holderId === phase.currentId);
  const other = current.gifts.filter((gift) => gift.holderId !== phase.currentId);
  return [...own, ...other];
}

function header(): HTMLElement {
  return el("header", { className: "mast" }, [
    hollyMark(),
    el("h1", {}, [document.createTextNode("White"), el("span", { text: "Elephant" })]),
    el("p", {
      className: "lede",
      text: "One screen for the room. Add everyone, then open a gift or steal one.",
    }),
    el("p", { className: "countdown", text: christmasCountdown(new Date()) }),
  ]);
}

function heading(current: ElephantGame): string {
  const phase = current.phase;
  if (phase.kind === "done") return "Who got what";
  const name = current.players.find((player) => player.id === phase.currentId)?.name ?? "";
  if (phase.kind === "finalSwap") return `${name}, final swap`;
  return `${name}'s turn`;
}

function message(text: string): HTMLParagraphElement {
  const node = el("p", { className: "alert", text, attrs: { role: "alert" } });
  node.hidden = text.length === 0;
  return node;
}

function load(): ElephantGame | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    const game = parseElephant(parsed);
    if (!game) localStorage.removeItem(KEY);
    return game;
  } catch {
    localStorage.removeItem(KEY);
    return null;
  }
}

function store(game: ElephantGame): void {
  localStorage.setItem(KEY, JSON.stringify(game));
}
