import { normalizeName } from "./participants";
import { TRIVIA_BANK, type TriviaQuestion, type TriviaTopic } from "./trivia-bank";
import type { Rng } from "./types";

export type PlayedTopic = TriviaTopic | "custom";

export interface PlayedQuestion {
  id: string;
  topic: PlayedTopic;
  prompt: string;
  choices: readonly [string, string, string, string];
  answer: 0 | 1 | 2 | 3;
}

export interface TriviaPlayer {
  id: string;
  name: string;
  score: number;
}

export type TriviaPhase =
  | { kind: "ask"; index: number; endsAt: number | null }
  | { kind: "answer"; index: number; scored: boolean }
  | { kind: "board" };

export interface TriviaGame {
  players: TriviaPlayer[];
  questions: PlayedQuestion[];
  seconds: number;
  phase: TriviaPhase;
}

export const TRIVIA_SETTINGS = {
  seconds: { min: 0, max: 180, default: 30 },
  count: { min: 1, max: 40, default: 10 },
  players: { min: 1, max: 16 },
  promptMax: 180,
  choiceMax: 80,
  nameMax: 40,
} as const;

export interface CustomDraft {
  prompt: string;
  choices: readonly [string, string, string, string];
  answer: 0 | 1 | 2 | 3;
}

export interface TriviaSetup {
  names: readonly string[];
  custom: readonly CustomDraft[];
  seconds: number;
  count: number;
}

export type TriviaAction =
  | { kind: "reveal" }
  | { kind: "point"; playerId: string | null }
  | { kind: "next"; now: number }
  | { kind: "end" };

export type TriviaResult = { ok: true; game: TriviaGame } | { ok: false; reason: string };

const TOPICS: readonly PlayedTopic[] = ["movie", "song", "tradition", "lyric", "custom"];

export function checkCustom(draft: CustomDraft): { ok: true } | { ok: false; reason: string } {
  const prompt = normalizeName(draft.prompt);
  if (!prompt) return { ok: false, reason: "Enter a question." };
  if ([...prompt].length > TRIVIA_SETTINGS.promptMax) {
    return { ok: false, reason: "Use a shorter question (180 characters or fewer)." };
  }
  if (draft.choices.length !== 4) return { ok: false, reason: "Enter four choices." };
  const choices = draft.choices.map((choice) => normalizeName(choice));
  if (choices.some((choice) => choice.length === 0)) return { ok: false, reason: "Enter four choices." };
  if (choices.some((choice) => [...choice].length > TRIVIA_SETTINGS.choiceMax)) {
    return { ok: false, reason: "Use a shorter choice (80 characters or fewer)." };
  }
  for (let i = 0; i < choices.length; i++) {
    for (let j = i + 1; j < choices.length; j++) {
      const left = choices[i];
      const right = choices[j];
      if (left !== undefined && right !== undefined && sameText(left, right)) {
        return { ok: false, reason: "Enter four different choices." };
      }
    }
  }
  if (!Number.isInteger(draft.answer) || draft.answer < 0 || draft.answer > 3) {
    return { ok: false, reason: "Pick the correct choice." };
  }
  return { ok: true };
}

export function startTrivia(setup: TriviaSetup, rng: Rng, now: number): TriviaResult {
  if (setup.names.length === 0) return { ok: false, reason: "Add at least one player." };
  const names: string[] = [];
  for (const raw of setup.names) {
    const name = normalizeName(raw);
    if (!name) return { ok: false, reason: "Enter a name." };
    if ([...name].length > TRIVIA_SETTINGS.nameMax) {
      return { ok: false, reason: "Use a shorter name (40 characters or fewer)." };
    }
    if (names.some((existing) => existing.localeCompare(name, undefined, { sensitivity: "accent" }) === 0)) {
      return { ok: false, reason: "That name is already on the list." };
    }
    names.push(name);
  }
  if (names.length > TRIVIA_SETTINGS.players.max) {
    return { ok: false, reason: "Use 16 players or fewer." };
  }
  if (!Number.isInteger(setup.seconds) || setup.seconds < TRIVIA_SETTINGS.seconds.min || setup.seconds > TRIVIA_SETTINGS.seconds.max) {
    return { ok: false, reason: "Set the timer from 0 to 180 seconds." };
  }
  if (!Number.isInteger(setup.count) || setup.count < TRIVIA_SETTINGS.count.min || setup.count > TRIVIA_SETTINGS.count.max) {
    return { ok: false, reason: "Set the question count from 1 to 40." };
  }
  for (const draft of setup.custom) {
    const checked = checkCustom(draft);
    if (!checked.ok) return checked;
  }
  if (setup.custom.length > setup.count) {
    return { ok: false, reason: "Raise the question count to fit your custom questions, or remove one." };
  }
  if (!Number.isFinite(now)) return { ok: false, reason: "Set a clock time." };

  const custom = setup.custom.map((draft, index) => playedCustom(draft, index));
  const need = setup.count - custom.length;
  const picked = shuffle(TRIVIA_BANK, rng).slice(0, need).map((question) => copyQuestion(question));
  const questions = shuffle([...custom, ...picked], rng);
  const players = names.map((name) => ({ id: crypto.randomUUID(), name, score: 0 }));

  return {
    ok: true,
    game: {
      players,
      questions,
      seconds: setup.seconds,
      phase: { kind: "ask", index: 0, endsAt: deadline(setup.seconds, now) },
    },
  };
}

export function act(game: TriviaGame, action: TriviaAction): TriviaResult {
  switch (action.kind) {
    case "reveal":
      return reveal(game);
    case "point":
      return point(game, action.playerId);
    case "next":
      return next(game, action.now);
    case "end":
      return end(game);
  }
}

export function timeUp(game: TriviaGame, now: number): boolean {
  return game.phase.kind === "ask" && game.phase.endsAt !== null && now >= game.phase.endsAt;
}

export function standings(game: TriviaGame): TriviaPlayer[] {
  return [...game.players].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

export function parseTrivia(value: unknown): TriviaGame | null {
  if (!isRecord(value) || !gameKeys(value)) return null;
  const players = parsePlayers(value.players);
  const questions = parseQuestions(value.questions);
  const seconds = value.seconds;
  if (!players || !questions) return null;
  if (typeof seconds !== "number" || !Number.isInteger(seconds) || seconds < TRIVIA_SETTINGS.seconds.min || seconds > TRIVIA_SETTINGS.seconds.max) {
    return null;
  }
  const phase = parsePhase(value.phase, questions.length);
  if (!phase) return null;
    return { players, questions, seconds, phase };
}

function reveal(game: TriviaGame): TriviaResult {
  if (game.phase.kind === "board") return { ok: false, reason: "The game is already over." };
  if (game.phase.kind === "answer") return { ok: false, reason: "The answer is already up." };
  return {
    ok: true,
    game: clone(game, { kind: "answer", index: game.phase.index, scored: false }),
  };
}

function point(game: TriviaGame, playerId: string | null): TriviaResult {
  if (game.phase.kind === "ask") return { ok: false, reason: "Show the answer first." };
  if (game.phase.kind === "board") return { ok: false, reason: "The game is already over." };
  if (game.phase.scored) return { ok: false, reason: "That question already has a score." };
  let players = game.players;
  if (playerId !== null) {
    if (!game.players.some((player) => player.id === playerId)) {
      return { ok: false, reason: "That player is not in this game." };
    }
    players = game.players.map((player) =>
      player.id === playerId ? { ...player, score: player.score + 1 } : player,
    );
  }
  return {
    ok: true,
    game: clone({ ...game, players }, { kind: "answer", index: game.phase.index, scored: true }),
  };
}

function next(game: TriviaGame, now: number): TriviaResult {
  if (game.phase.kind === "ask") return { ok: false, reason: "Show the answer first." };
  if (game.phase.kind === "board") return { ok: false, reason: "The game is already over." };
  if (!game.phase.scored) return { ok: false, reason: "Give the point before the next question." };
  if (!Number.isFinite(now)) return { ok: false, reason: "Set a clock time." };
  const index = game.phase.index + 1;
  if (index >= game.questions.length) return { ok: true, game: clone(game, { kind: "board" }) };
  return {
    ok: true,
    game: clone(game, { kind: "ask", index, endsAt: deadline(game.seconds, now) }),
  };
}

function end(game: TriviaGame): TriviaResult {
  if (game.phase.kind === "board") return { ok: false, reason: "The game is already over." };
  return { ok: true, game: clone(game, { kind: "board" }) };
}

function sameText(a: string, b: string): boolean {
  return a.localeCompare(b, undefined, { sensitivity: "accent" }) === 0;
}

function deadline(seconds: number, now: number): number | null {
  return seconds === 0 ? null : now + seconds * 1000;
}

function playedCustom(draft: CustomDraft, index: number): PlayedQuestion {
  const choices = draft.choices.map((choice) => normalizeName(choice));
  return {
    id: `c${index + 1}`,
    topic: "custom",
    prompt: normalizeName(draft.prompt),
    choices: tuple(choices),
    answer: draft.answer,
  };
}

function copyQuestion(question: TriviaQuestion | PlayedQuestion): PlayedQuestion {
  return {
    id: question.id,
    topic: question.topic,
    prompt: question.prompt,
    choices: tuple([...question.choices]),
    answer: question.answer,
  };
}

function clone(game: TriviaGame, phase: TriviaPhase): TriviaGame {
  return {
    players: game.players.map((player) => ({ ...player })),
    questions: game.questions.map((question) => copyQuestion(question)),
    seconds: game.seconds,
    phase,
  };
}

function tuple(choices: readonly string[]): PlayedQuestion["choices"] {
  return [choices[0] ?? "", choices[1] ?? "", choices[2] ?? "", choices[3] ?? ""];
}

function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const unit = Math.min(0.999999, Math.max(0, rng()));
    const j = Math.floor(unit * (i + 1));
    const current = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = current;
  }
  return copy;
}

function parsePlayers(value: unknown): TriviaPlayer[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > TRIVIA_SETTINGS.players.max) return null;
  const players: TriviaPlayer[] = [];
  for (const item of value) {
    if (!isRecord(item) || !exactKeys(item, ["id", "name", "score"])) return null;
    if (typeof item.id !== "string" || item.id.length === 0) return null;
    if (typeof item.name !== "string" || item.name !== normalizeName(item.name)) return null;
    if (item.name.length === 0 || [...item.name].length > TRIVIA_SETTINGS.nameMax) return null;
    if (typeof item.score !== "number" || !Number.isInteger(item.score) || item.score < 0) return null;
    players.push({ id: item.id, name: item.name, score: item.score });
  }
  if (new Set(players.map((player) => player.id)).size !== players.length) return null;
  return players;
}

function parseQuestions(value: unknown): PlayedQuestion[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > TRIVIA_SETTINGS.count.max) return null;
  const questions: PlayedQuestion[] = [];
  for (const item of value) {
    if (!isRecord(item) || !exactKeys(item, ["id", "topic", "prompt", "choices", "answer"])) return null;
    if (typeof item.id !== "string" || item.id.length === 0) return null;
    if (typeof item.topic !== "string" || !TOPICS.includes(item.topic as PlayedTopic)) return null;
    if (typeof item.prompt !== "string" || item.prompt.length === 0) return null;
    if (!Array.isArray(item.choices) || item.choices.length !== 4) return null;
    if (item.choices.some((choice) => typeof choice !== "string" || choice.length === 0)) return null;
    if (typeof item.answer !== "number" || !Number.isInteger(item.answer) || item.answer < 0 || item.answer > 3) {
      return null;
    }
    questions.push({
      id: item.id,
      topic: item.topic as PlayedTopic,
      prompt: item.prompt,
      choices: tuple(item.choices as string[]),
      answer: item.answer as 0 | 1 | 2 | 3,
    });
  }
  if (new Set(questions.map((question) => question.id)).size !== questions.length) return null;
  return questions;
}

function parsePhase(value: unknown, count: number): TriviaPhase | null {
  if (!isRecord(value) || typeof value.kind !== "string") return null;
  if (value.kind === "board") {
    if (!exactKeys(value, ["kind"])) return null;
    return { kind: "board" };
  }
  if (typeof value.index !== "number" || !Number.isInteger(value.index) || value.index < 0 || value.index >= count) {
    return null;
  }
  if (value.kind === "ask") {
    if (!exactKeys(value, ["kind", "index", "endsAt"])) return null;
    if (value.endsAt !== null && (typeof value.endsAt !== "number" || !Number.isFinite(value.endsAt))) return null;
    return { kind: "ask", index: value.index, endsAt: value.endsAt };
  }
  if (value.kind === "answer") {
    if (!exactKeys(value, ["kind", "index", "scored"]) || typeof value.scored !== "boolean") return null;
    return { kind: "answer", index: value.index, scored: value.scored };
  }
  return null;
}

function gameKeys(value: Record<string, unknown>): boolean {
  const allowed = ["players", "questions", "seconds", "phase"];
  const present = Object.keys(value);
  if (present.length !== allowed.length) return false;
  return allowed.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const present = Object.keys(value);
  if (present.length !== keys.length) return false;
  return keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
