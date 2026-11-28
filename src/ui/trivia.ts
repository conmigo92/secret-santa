import { christmasCountdown } from "../domain/calendar";
import { normalizeName } from "../domain/participants";
import {
  act,
  checkCustom,
  parseTrivia,
  standings,
  startTrivia,
  timeUp,
  TRIVIA_SETTINGS,
  type CustomDraft,
  type TriviaAction,
  type TriviaGame,
  type TriviaPhase,
} from "../domain/trivia";
import { el, hollyMark } from "./dom";
import { mountSiteNav } from "./site-nav";

const KEY = "secret-santa.trivia";

export function mountTrivia(root: HTMLElement): void {
  let game = load();
  let names: string[] = [];
  let nameDraft = "";
  let secondsDraft = String(TRIVIA_SETTINGS.seconds.default);
  let countDraft = String(TRIVIA_SETTINGS.count.default);
  let custom: CustomDraft[] = [];
  let promptDraft = "";
  let choiceDrafts = ["", "", "", ""];
  let answerDraft = "0";
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
      el("p", { className: "quiet", text: "One name for each player or team." }),
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

    const seconds = numberField("seconds", "Seconds", secondsDraft, (value) => {
      secondsDraft = value;
    });
    const count = numberField("count", "Questions", countDraft, (value) => {
      countDraft = value;
    });
    const start = el("button", { className: "primary draw", text: "Start game", attrs: { type: "button" } });
    start.addEventListener("click", () => {
      const secondsValue = readInt(secondsDraft);
      const countValue = readInt(countDraft);
      if (secondsValue === null) {
        error = "Set the timer from 0 to 180 seconds.";
        draw();
        return;
      }
      if (countValue === null) {
        error = "Set the question count from 1 to 40.";
        draw();
        return;
      }
      const started = startTrivia(
        { names, custom, seconds: secondsValue, count: countValue },
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
        seconds.field,
        el("p", { className: "quiet", text: "0 waits until you show the answer." }),
        count.field,
        el("p", {
          className: "quiet",
          text: "Custom questions are always included, so the count has to cover them.",
        }),
        customForm(),
        customList(),
        start,
      ]),
    ]);
    mountSiteNav(shell);
    root.replaceChildren(shell);
  }

  function customForm(): HTMLFormElement {
    const prompt = el("input", {
      attrs: { id: "custom-prompt", name: "custom-prompt", type: "text", maxlength: "180", placeholder: "Question" },
    });
    prompt.value = promptDraft;
    prompt.addEventListener("input", () => {
      promptDraft = prompt.value;
    });
    const inputs = choiceDrafts.map((value, index) => {
      const input = el("input", {
        attrs: {
          id: `custom-choice-${index}`,
          type: "text",
          maxlength: "80",
          placeholder: `Choice ${index + 1}`,
        },
      });
      input.value = value;
      input.addEventListener("input", () => {
        choiceDrafts = choiceDrafts.map((choice, item) => (item === index ? input.value : choice));
      });
      return input;
    });
    const select = el("select", { attrs: { id: "custom-answer" } });
    for (let index = 0; index < 4; index++) {
      const option = el("option", { text: `Choice ${index + 1}`, attrs: { value: String(index) } });
      if (String(index) === answerDraft) option.selected = true;
      select.append(option);
    }
    select.addEventListener("change", () => {
      answerDraft = select.value;
    });
    const form = el("form", { className: "stack" }, [
      el("h2", { text: "Your questions" }),
      el("label", { text: "Question", attrs: { for: "custom-prompt" } }),
      prompt,
      ...inputs,
      el("label", { text: "Correct choice", attrs: { for: "custom-answer" } }),
      select,
      el("button", { className: "ghost", text: "Add question", attrs: { type: "submit" } }),
    ]);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const draft: CustomDraft = {
        prompt: promptDraft,
        choices: [choiceDrafts[0] ?? "", choiceDrafts[1] ?? "", choiceDrafts[2] ?? "", choiceDrafts[3] ?? ""],
        answer: Number(answerDraft) as 0 | 1 | 2 | 3,
      };
      const checked = checkCustom(draft);
      if (!checked.ok) {
        error = checked.reason;
        draw();
        return;
      }
      custom = [
        ...custom,
        {
          prompt: normalizeName(draft.prompt),
          choices: [
            normalizeName(draft.choices[0] ?? ""),
            normalizeName(draft.choices[1] ?? ""),
            normalizeName(draft.choices[2] ?? ""),
            normalizeName(draft.choices[3] ?? ""),
          ],
          answer: draft.answer,
        },
      ];
      promptDraft = "";
      choiceDrafts = ["", "", "", ""];
      answerDraft = "0";
      error = "";
      draw();
    });
    return form;
  }

  function customList(): HTMLElement {
    if (custom.length === 0) return el("p", { className: "quiet", text: "No custom questions yet." });
    const list = el("ul", { className: "rows" });
    for (const [index, draft] of custom.entries()) {
      const remove = el("button", { className: "ghost", text: "Remove", attrs: { type: "button" } });
      remove.addEventListener("click", () => {
        custom = custom.filter((_, item) => item !== index);
        error = "";
        draw();
      });
      list.append(el("li", {}, [el("span", { text: draft.prompt }), remove]));
    }
    return list;
  }

  function drawPlay(current: TriviaGame): void {
    const phase = current.phase;
    const body: HTMLElement[] = [header(), scoreLine(current), message(error)];
    if (phase.kind === "board") body.push(board(current));
    else body.push(questionBlock(current, phase));
    body.push(resetButton());
    const shell = el("main", { className: "shell party" }, body);
    mountSiteNav(shell);
    root.replaceChildren(shell);
  }

  function questionBlock(current: TriviaGame, phase: Exclude<TriviaPhase, { kind: "board" }>): HTMLElement {
    const question = current.questions[phase.index];
    if (!question) return el("p", { text: "That question is missing." });
    const choices = el("ul", { className: "choices" });
    for (const [index, choice] of question.choices.entries()) {
      const right = phase.kind === "answer" && index === question.answer;
      const item = el("li", { className: right ? "is-right" : undefined });
      if (right) item.append(el("span", { className: "mark-answer", text: "Answer" }));
      item.append(document.createTextNode(choice));
      choices.append(item);
    }
    const block = el("div", { className: "stack" }, [
      el("h2", { text: `Question ${phase.index + 1} of ${current.questions.length}` }),
    ]);
    if (phase.kind === "ask") block.append(el("p", { className: "timer", text: timerText(phase, Date.now()) }));
    block.append(el("p", { className: "prompt", text: question.prompt }), choices);
    if (phase.kind === "ask") {
      const show = el("button", { className: "primary", text: "Show answer", attrs: { type: "button" } });
      show.addEventListener("click", () => apply({ kind: "reveal" }));
      block.append(show);
    } else if (!phase.scored) {
      const points = el("div", { className: "point-row" });
      for (const player of current.players) {
        const button = el("button", {
          className: "primary",
          text: `Point to ${player.name}`,
          attrs: { type: "button" },
        });
        button.addEventListener("click", () => apply({ kind: "point", playerId: player.id }));
        points.append(button);
      }
      const none = el("button", { className: "ghost", text: "No point", attrs: { type: "button" } });
      none.addEventListener("click", () => apply({ kind: "point", playerId: null }));
      points.append(none);
      block.append(points);
    } else {
      const last = phase.index + 1 >= current.questions.length;
      const next = el("button", {
        className: "primary",
        text: last ? "Scores" : "Next",
        attrs: { type: "button" },
      });
      next.addEventListener("click", () => apply({ kind: "next", now: Date.now() }));
      block.append(next);
    }
    block.append(endButton());
    return block;
  }

  function board(current: TriviaGame): HTMLElement {
    const list = el("ol", { className: "turn-order" });
    for (const player of standings(current)) {
      list.append(el("li", { text: `${player.name}, ${player.score}` }));
    }
    return el("div", { className: "stack" }, [el("h2", { text: "Scores" }), list]);
  }

  function scoreLine(current: TriviaGame): HTMLElement {
    const list = el("ul", { className: "score-row" });
    for (const player of standings(current)) {
      list.append(el("li", { text: `${player.name} ${player.score}` }));
    }
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
      custom = [];
      secondsDraft = String(TRIVIA_SETTINGS.seconds.default);
      countDraft = String(TRIVIA_SETTINGS.count.default);
      confirm = "";
      error = "";
      draw();
    });
    return button;
  }

  function apply(action: TriviaAction): void {
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
    if (!game || game.phase.kind !== "ask" || game.phase.endsAt === null) return;
    clock = window.setInterval(() => {
      if (!game || game.phase.kind !== "ask" || game.phase.endsAt === null) return;
      if (timeUp(game, Date.now())) {
        apply({ kind: "reveal" });
        return;
      }
      const node = root.querySelector(".timer");
      if (node) node.textContent = timerText(game.phase, Date.now());
    }, 200);
  }
}

function timerText(phase: Extract<TriviaPhase, { kind: "ask" }>, now: number): string {
  if (phase.endsAt === null) return "No timer";
  return formatTime(phase.endsAt - now);
}

function formatTime(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function readInt(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  return Number(value.trim());
}

function numberField(
  id: string,
  label: string,
  value: string,
  onInput: (value: string) => void,
): { field: HTMLElement } {
  const input = el("input", {
    attrs: { id, name: id, type: "number", min: "0", step: "1", inputmode: "numeric" },
  });
  input.value = value;
  input.addEventListener("input", () => onInput(input.value));
  return {
    field: el("div", { className: "field" }, [el("label", { text: label, attrs: { for: id } }), input]),
  };
}

function header(): HTMLElement {
  return el("header", { className: "mast" }, [
    hollyMark(),
    el("h1", {}, [document.createTextNode("Christmas"), el("span", { text: "Trivia" })]),
    el("p", { className: "lede", text: "Read a question, show the answer, then give the point." }),
    el("p", { className: "countdown", text: christmasCountdown(new Date()) }),
  ]);
}

function message(text: string): HTMLParagraphElement {
  const node = el("p", { className: "alert", text, attrs: { role: "alert" } });
  node.hidden = text.length === 0;
  return node;
}

function load(): TriviaGame | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const game = parseTrivia(JSON.parse(raw));
    if (!game) localStorage.removeItem(KEY);
    return game;
  } catch {
    localStorage.removeItem(KEY);
    return null;
  }
}

function store(game: TriviaGame): void {
  localStorage.setItem(KEY, JSON.stringify(game));
}
