import { christmasCountdown } from "../domain/calendar";
import { normalizeName } from "../domain/participants";
import {
  chooseSwap,
  DEFAULT_FACE_MAP,
  parseDice,
  pause,
  resume,
  roll,
  setLabel,
  startDice,
  startRound2,
  tick,
  type DiceGame,
  type Face,
  type FaceEffect,
  type FaceMap,
} from "../domain/dirty-santa";
import { el, hollyMark } from "./dom";
import { mountSiteNav } from "./site-nav";

const KEY = "secret-santa.dirty-santa";
const FACES: Face[] = [1, 2, 3, 4, 5, 6];
const EFFECTS: FaceEffect[] = ["passLeft", "passRight", "swapAny", "allLeft", "allRight", "keep"];
const EFFECT_LABEL: Record<FaceEffect, string> = {
  passLeft: "Pass your gift left",
  passRight: "Pass your gift right",
  swapAny: "Swap with anyone",
  allLeft: "Everyone passes left",
  allRight: "Everyone passes right",
  keep: "Keep and roll again",
};

export function mountDirtySanta(root: HTMLElement): void {
  let game = load();
  let names: string[] = [];
  let minutesValue = "3";
  let round2On = false;
  let faceChoices: FaceMap = { ...DEFAULT_FACE_MAP };
  let armed = false;
  let error = "";
  let view: "circle" | "list" = window.matchMedia("(min-width: 48rem)").matches ? "circle" : "list";
  let lastFace: Face | null = null;
  let lastLine = "";
  let clock = 0;

  draw();

  function draw(): void {
    window.clearInterval(clock);
    if (game) drawPlay();
    else drawSetup();
    armClock();
  }

  function drawSetup(): void {
    const nameInput = el("input", {
      attrs: { id: "seat-name", name: "seat-name", type: "text", maxlength: "40", placeholder: "Name" },
    });
    const minutes = el("input", {
      attrs: {
        id: "minutes",
        name: "minutes",
        type: "number",
        min: "0.25",
        max: "30",
        step: "0.25",
        value: minutesValue,
      },
    });
    minutes.addEventListener("input", () => {
      minutesValue = minutes.value;
    });
    const round2 = el("input", { attrs: { id: "round-2", type: "checkbox" } });
    round2.checked = round2On;
    round2.addEventListener("change", () => {
      round2On = round2.checked;
    });
    const list = el("ol", { className: "rows turn-order" });
    names.forEach((name, index) => {
      const up = el("button", { className: "ghost", text: "Up", attrs: { type: "button" } });
      const down = el("button", { className: "ghost", text: "Down", attrs: { type: "button" } });
      const remove = el("button", { className: "ghost", text: "Remove", attrs: { type: "button" } });
      up.addEventListener("click", () => shift(index, -1));
      down.addEventListener("click", () => shift(index, 1));
      remove.addEventListener("click", () => {
        names = names.filter((_, item) => item !== index);
        error = "";
        draw();
      });
      list.append(el("li", {}, [el("span", { text: name }), up, down, remove]));
    });

    const form = el("form", { className: "stack" }, [
      el("label", { className: "heading", text: "Seats", attrs: { for: "seat-name" } }),
      el("p", {
        className: "quiet",
        text: "Enter names in seat order. Left is the next name. The last person's left is the first name.",
      }),
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
      error = "";
      draw();
    });

    const faces = el("div", { className: "face-grid" });
    for (const face of FACES) {
      faces.append(
        faceField(face, faceChoices[face], (effect) => {
          faceChoices = { ...faceChoices, [face]: effect };
        }),
      );
    }

    const start = el("button", { className: "primary draw", text: "Start round", attrs: { type: "button" } });
    start.addEventListener("click", () => {
      const map = readMap();
      if (!map) {
        error = "Each face needs an action.";
        draw();
        return;
      }
      const started = startDice(
        names,
        { durationMs: Math.round(Number(minutes.value) * 60_000), round2: round2.checked, faces: map },
        Date.now(),
      );
      if (!started.ok) {
        error = started.reason;
        draw();
        return;
      }
      error = "";
      lastFace = null;
      lastLine = "";
      game = started.game;
      store(game);
      draw();
    });

    const shell = el("main", { className: "shell party" }, [
      header(),
      form,
      el("div", { className: "field" }, [
        el("label", { text: "Minutes", attrs: { for: "minutes" } }),
        minutes,
        el("p", { className: "quiet", text: "The round lasts this long. 3 is the usual length." }),
      ]),
      el("label", { className: "choice" }, [round2, el("span", { text: "Second round after unwrapping" })]),
      el("h2", { text: "Die faces" }),
      faces,
      start,
    ]);
    mountSiteNav(shell);
    root.replaceChildren(shell);
    nameInput.focus();
  }

  function drawPlay(): void {
    if (!game) return;
    const current = game;
    const parts: HTMLElement[] = [timerBlock(current), legend(current), viewSwitch(), seats(current)];

    if (lastFace !== null) {
      parts.push(el("p", { className: "die-face", text: String(lastFace) }));
    }
    parts.push(el("p", { text: lastLine, attrs: { "aria-live": "polite" } }));

    if (current.phase.kind === "rolling") {
      const button = el("button", { className: "primary draw", text: "Roll", attrs: { type: "button" } });
      button.addEventListener("click", () => {
        const actor = current.seats[current.turn];
        const face = randomFace();
        const result = roll(current, face, Date.now());
        game = result.game;
        if (!result.ok) {
          error = result.reason;
          lastFace = null;
        } else {
          error = "";
          lastFace = face;
          const effect = current.faces[face];
          lastLine = effect === "swapAny" || !actor ? "" : sentence(effect, actor.name, "");
        }
        store(game);
        draw();
      });
      parts.push(button);
    }

    if (current.phase.kind === "chooseSwap") {
      parts.push(el("h2", { text: "Swap with whom?" }));
      for (const [index, seat] of current.seats.entries()) {
        if (index === current.turn) continue;
        const button = el("button", {
          className: "primary",
          text: `Swap with ${seat.name}`,
          attrs: { type: "button" },
        });
        button.addEventListener("click", () => {
          const actor = current.seats[current.turn];
          const result = chooseSwap(current, index, Date.now());
          game = result.game;
          if (!result.ok) error = result.reason;
          else {
            error = "";
            lastLine = actor ? sentence("swapAny", actor.name, seat.name) : "";
          }
          store(game);
          draw();
        });
        parts.push(button);
      }
    }

    if (current.phase.kind === "between") parts.push(between(current));
    if (current.phase.kind === "done") parts.push(finalList(current));
    parts.push(message(error));
    parts.push(resetButton());

    const shell = el("main", { className: "shell party" }, [header(), el("div", { className: "stack" }, parts)]);
    mountSiteNav(shell);
    root.replaceChildren(shell);
  }

  function between(current: DiceGame): HTMLElement {
    const block = el("div", { className: "stack" }, [
      el("h2", { text: "Unwrap the gifts" }),
      el("p", { className: "quiet", text: "Add a label if you want one, then start round 2." }),
    ]);
    for (const gift of current.gifts) {
      const holder = current.seats.find((seat) => seat.giftId === gift.id);
      const input = el("input", {
        attrs: { type: "text", maxlength: "40", placeholder: "Label", "data-gift": gift.id, value: gift.label },
      });
      block.append(
        el("label", { className: "field" }, [
          el("span", { text: `${holder?.name ?? "Gift"} has gift ${gift.number}` }),
          input,
        ]),
      );
    }
    const start = el("button", { className: "primary", text: "Start round 2", attrs: { type: "button" } });
    start.addEventListener("click", () => {
      let next = current;
      for (const input of block.querySelectorAll("input")) {
        const giftId = input.getAttribute("data-gift");
        if (!giftId) continue;
        const labeled = setLabel(next, giftId, input.value);
        if (!labeled.ok) {
          error = labeled.reason;
          game = labeled.game;
          draw();
          return;
        }
        next = labeled.game;
      }
      const started = startRound2(next, Date.now());
      game = started.game;
      error = started.ok ? "" : started.reason;
      if (started.ok) {
        lastFace = null;
        lastLine = "";
      }
      store(game);
      draw();
    });
    block.append(start);
    return block;
  }

  function seats(current: DiceGame): HTMLElement {
    if (view === "list") {
      const list = el("ol", { className: "holding" });
      current.seats.forEach((_, index) => list.append(seatNode(current, index, false)));
      return list;
    }
    const board = el("div", { className: "board" });
    current.seats.forEach((_, index) => board.append(seatNode(current, index, true)));
    return board;
  }

  function seatNode(current: DiceGame, index: number, circle: boolean): HTMLElement {
    const seat = current.seats[index];
    if (!seat) return el("div");
    const gift = current.gifts.find((item) => item.id === seat.giftId);
    const rolling = index === current.turn && (current.phase.kind === "rolling" || current.phase.kind === "chooseSwap");
    const lines = [`${seat.name}`, gift ? `Gift ${gift.number}` : ""];
    if (gift && !current.wrapped && gift.label) lines.push(gift.label);
    if (rolling) lines.push("Rolling");
    const node = el("article", { className: rolling ? "seat current" : "seat" }, [
      el("p", { text: lines.filter(Boolean).join(". ") }),
    ]);
    if (circle) {
      const spot = place(index, current.seats.length);
      node.style.left = spot.left;
      node.style.top = spot.top;
    }
    return node;
  }

  function timerBlock(current: DiceGame): HTMLElement {
    const block = el("div", { className: "stack" }, [
      el("p", { className: "timer", text: formatTime(current.timer.remainingMs) }),
    ]);
    if (current.phase.kind === "rolling" || current.phase.kind === "chooseSwap") {
      const running = current.timer.deadline !== null;
      const button = el("button", {
        className: "ghost",
        text: running ? "Pause" : "Resume",
        attrs: { type: "button" },
      });
      button.addEventListener("click", () => {
        if (!game) return;
        game = running ? pause(game, Date.now()) : resume(game, Date.now());
        store(game);
        draw();
      });
      block.append(button);
    }
    return block;
  }

  function viewSwitch(): HTMLElement {
    const circle = el("button", { className: "ghost", text: "Circle", attrs: { type: "button" } });
    const list = el("button", { className: "ghost", text: "List", attrs: { type: "button" } });
    circle.setAttribute("aria-pressed", view === "circle" ? "true" : "false");
    list.setAttribute("aria-pressed", view === "list" ? "true" : "false");
    circle.addEventListener("click", () => {
      view = "circle";
      draw();
    });
    list.addEventListener("click", () => {
      view = "list";
      draw();
    });
    return el("div", { className: "view-row" }, [circle, list]);
  }

  function finalList(current: DiceGame): HTMLElement {
    const list = el("ul", { className: "rows" });
    for (const seat of current.seats) {
      const gift = current.gifts.find((item) => item.id === seat.giftId);
      const number = gift?.number ?? 0;
      const label = gift?.label ? ` (${gift.label})` : "";
      list.append(el("li", { text: `${seat.name} has gift ${number}${label}.` }));
    }
    return el("div", {}, [el("h2", { text: "Final gifts" }), list]);
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
        draw();
        return;
      }
      window.clearInterval(clock);
      localStorage.removeItem(KEY);
      game = null;
      names = [];
      armed = false;
      error = "";
      lastFace = null;
      lastLine = "";
      draw();
    });
    return button;
  }

  function shift(index: number, delta: number): void {
    const next = index + delta;
    const item = names[index];
    const other = names[next];
    if (item === undefined || other === undefined) return;
    const copy = [...names];
    copy[index] = other;
    copy[next] = item;
    names = copy;
    draw();
  }

  function armClock(): void {
    window.clearInterval(clock);
    if (!game) return;
    if (game.phase.kind !== "rolling" && game.phase.kind !== "chooseSwap") return;
    clock = window.setInterval(() => {
      if (!game) return;
      const next = tick(game, Date.now());
      if (next === game) return;
      const ended = next.phase.kind !== game.phase.kind;
      game = next;
      store(game);
      if (ended) draw();
      else {
        const node = root.querySelector(".timer");
        if (node) node.textContent = formatTime(game.timer.remainingMs);
      }
    }, 200);
  }
}

function faceField(face: Face, selected: FaceEffect, onChange: (effect: FaceEffect) => void): HTMLElement {
  const select = el("select", { attrs: { id: `face-${face}` } });
  for (const effect of EFFECTS) {
    const option = el("option", { text: EFFECT_LABEL[effect], attrs: { value: effect } });
    if (effect === selected) option.selected = true;
    select.append(option);
  }
  select.addEventListener("change", () => {
    if (isEffect(select.value)) onChange(select.value);
  });
  return el("div", { className: "field" }, [
    el("label", { text: `Face ${face}`, attrs: { for: `face-${face}` } }),
    select,
  ]);
}

function readMap(): FaceMap | null {
  const map: Partial<FaceMap> = {};
  for (const face of FACES) {
    const select = document.getElementById(`face-${face}`);
    if (!(select instanceof HTMLSelectElement) || !isEffect(select.value)) return null;
    map[face] = select.value;
  }
  if (!isComplete(map)) return null;
  return map;
}

function isComplete(map: Partial<FaceMap>): map is FaceMap {
  return FACES.every((face) => isEffect(map[face]));
}

function isEffect(value: unknown): value is FaceEffect {
  return typeof value === "string" && EFFECTS.some((effect) => effect === value);
}

function randomFace(): Face {
  const value = 1 + Math.floor(Math.random() * 6);
  if (value === 1 || value === 2 || value === 3 || value === 4 || value === 5 || value === 6) return value;
  return 1;
}

function sentence(effect: FaceEffect, name: string, other: string): string {
  if (effect === "passLeft") return `${name} passes left.`;
  if (effect === "passRight") return `${name} passes right.`;
  if (effect === "allLeft") return "Everyone passes left.";
  if (effect === "allRight") return "Everyone passes right.";
  if (effect === "keep") return `${name} keeps the gift and rolls again.`;
  return `${name} swaps with ${other}.`;
}

function legend(game: DiceGame): HTMLElement {
  const list = el("ul", { className: "rows" });
  for (const face of FACES) {
    list.append(el("li", { text: `${face}. ${EFFECT_LABEL[game.faces[face]]}` }));
  }
  return el("div", {}, [el("h2", { text: "Die faces" }), list]);
}

function place(index: number, count: number): { left: string; top: string } {
  const angle = (Math.PI * 2 * index) / count - Math.PI / 2;
  return {
    left: `${50 + Math.cos(angle) * 30}%`,
    top: `${50 + Math.sin(angle) * 30}%`,
  };
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
    el("h1", {}, [document.createTextNode("Dirty"), el("span", { text: "Santa" })]),
    el("p", { className: "lede", text: "Everyone starts with a wrapped gift. Pass the phone and roll." }),
    el("p", { className: "countdown", text: christmasCountdown(new Date()) }),
  ]);
}

function message(text: string): HTMLParagraphElement {
  const node = el("p", { className: "alert", text, attrs: { role: "alert" } });
  node.hidden = text.length === 0;
  return node;
}

function load(): DiceGame | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const game = parseDice(JSON.parse(raw));
    if (!game) localStorage.removeItem(KEY);
    return game;
  } catch {
    localStorage.removeItem(KEY);
    return null;
  }
}

function store(game: DiceGame): void {
  localStorage.setItem(KEY, JSON.stringify(game));
}
