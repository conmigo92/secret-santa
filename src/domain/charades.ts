import { CHARADES_BANK, type ActCard, type Difficulty } from "./charades-bank";
import { normalizeName } from "./participants";
import type { Rng } from "./types";

export type { Difficulty };

export type ActMode = "charades" | "pictionary";

export interface ActTeam {
  id: string;
  name: string;
  score: number;
}

export type ActPhase =
  | { kind: "hidden"; teamIndex: number; card: ActCard; endsAt: number }
  | { kind: "show"; teamIndex: number; card: ActCard; endsAt: number }
  | { kind: "board" };

export interface ActGame {
  mode: ActMode;
  teams: ActTeam[];
  seconds: number;
  draw: ActCard[];
  phase: ActPhase;
}

export const ACT_SETTINGS = {
  seconds: { min: 10, max: 180, default: 60 },
  teams: { min: 2, max: 8 },
  nameMax: 40,
} as const;

export const DIFFICULTIES: readonly Difficulty[] = ["easy", "medium", "hard"];

export interface ActSetup {
  names: readonly string[];
  mode: ActMode;
  difficulties: readonly Difficulty[];
  seconds: number;
}

export type ActAction =
  | { kind: "reveal" }
  | { kind: "score"; now: number }
  | { kind: "skip" }
  | { kind: "pass"; now: number }
  | { kind: "end" };

export type ActResult = { ok: true; game: ActGame } | { ok: false; reason: string };

export function startCharades(setup: ActSetup, rng: Rng, now: number): ActResult {
  if (setup.names.length === 0) return { ok: false, reason: "Add at least two teams." };
  const names: string[] = [];
  for (const raw of setup.names) {
    const name = normalizeName(raw);
    if (!name) return { ok: false, reason: "Enter a name." };
    if ([...name].length > ACT_SETTINGS.nameMax) {
      return { ok: false, reason: "Use a shorter name (40 characters or fewer)." };
    }
    if (names.some((existing) => existing.localeCompare(name, undefined, { sensitivity: "accent" }) === 0)) {
      return { ok: false, reason: "That name is already on the list." };
    }
    names.push(name);
  }
  if (names.length < ACT_SETTINGS.teams.min) return { ok: false, reason: "Add at least two teams." };
  if (names.length > ACT_SETTINGS.teams.max) return { ok: false, reason: "Use 8 teams or fewer." };
  if (setup.mode !== "charades" && setup.mode !== "pictionary") {
    return { ok: false, reason: "Pick charades or pictionary." };
  }
  const difficulties = [...new Set(setup.difficulties)];
  if (difficulties.length === 0 || difficulties.some((item) => !DIFFICULTIES.includes(item))) {
    return { ok: false, reason: "Pick at least one difficulty." };
  }
  if (!Number.isInteger(setup.seconds) || setup.seconds < ACT_SETTINGS.seconds.min || setup.seconds > ACT_SETTINGS.seconds.max) {
    return { ok: false, reason: "Set the timer from 10 to 180 seconds." };
  }
  if (!Number.isFinite(now)) return { ok: false, reason: "Set a clock time." };

  const deck = shuffle(
    CHARADES_BANK.filter((card) => difficulties.includes(card.difficulty)).map((card) => ({ ...card })),
    rng,
  );
  const first = deck[0];
  if (!first) return { ok: false, reason: "Pick at least one difficulty." };
  return {
    ok: true,
    game: {
      mode: setup.mode,
      teams: names.map((name) => ({ id: crypto.randomUUID(), name, score: 0 })),
      seconds: setup.seconds,
      draw: deck.slice(1),
      phase: { kind: "hidden", teamIndex: 0, card: first, endsAt: now + setup.seconds * 1000 },
    },
  };
}

export function act(game: ActGame, action: ActAction): ActResult {
  switch (action.kind) {
    case "reveal":
      return reveal(game);
    case "score":
      return score(game, action.now);
    case "skip":
      return skip(game);
    case "pass":
      return pass(game, action.now);
    case "end":
      return end(game);
  }
}

export function timeUp(game: ActGame, now: number): boolean {
  return game.phase.kind !== "board" && now >= game.phase.endsAt;
}

export function standings(game: ActGame): ActTeam[] {
  return [...game.teams].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

export function parseCharades(value: unknown): ActGame | null {
  if (!isRecord(value) || !exactKeys(value, ["mode", "teams", "seconds", "draw", "phase"])) return null;
  if (value.mode !== "charades" && value.mode !== "pictionary") return null;
  const teams = parseTeams(value.teams);
  const draw = parseCards(value.draw);
  const seconds = value.seconds;
  if (!teams || !draw) return null;
  if (typeof seconds !== "number" || !Number.isInteger(seconds) || seconds < ACT_SETTINGS.seconds.min || seconds > ACT_SETTINGS.seconds.max) {
    return null;
  }
  const phase = parsePhase(value.phase, teams.length);
  if (!phase) return null;
  return { mode: value.mode, teams, seconds, draw, phase };
}

function reveal(game: ActGame): ActResult {
  if (game.phase.kind === "board") return { ok: false, reason: "The game is already over." };
  if (game.phase.kind === "show") return { ok: false, reason: "The word is already up." };
  return { ok: true, game: clone(game, { ...game.phase, kind: "show" }) };
}

function score(game: ActGame, now: number): ActResult {
  if (game.phase.kind === "board") return { ok: false, reason: "The game is already over." };
  if (game.phase.kind === "hidden") return { ok: false, reason: "Show the word first." };
  if (!Number.isFinite(now)) return { ok: false, reason: "Set a clock time." };
  const teamIndex = game.phase.teamIndex;
  const teams = game.teams.map((team, index) =>
    index === teamIndex ? { ...team, score: team.score + 1 } : team,
  );
  return advance({ ...game, teams }, nextTeam(game), now, true);
}

function skip(game: ActGame): ActResult {
  if (game.phase.kind === "board") return { ok: false, reason: "The game is already over." };
  return advance(game, game.phase.teamIndex, game.phase.endsAt, false);
}

function pass(game: ActGame, now: number): ActResult {
  if (game.phase.kind === "board") return { ok: false, reason: "The game is already over." };
  if (!Number.isFinite(now)) return { ok: false, reason: "Set a clock time." };
  return advance(game, nextTeam(game), now, true);
}

function end(game: ActGame): ActResult {
  if (game.phase.kind === "board") return { ok: false, reason: "The game is already over." };
  return { ok: true, game: clone(game, { kind: "board" }) };
}

function advance(game: ActGame, teamIndex: number, now: number, fresh: boolean): ActResult {
  const card = game.draw[0];
  if (!card || game.phase.kind === "board") return { ok: true, game: clone(game, { kind: "board" }) };
  const endsAt = fresh ? now + game.seconds * 1000 : game.phase.endsAt;
  return {
    ok: true,
    game: clone(
      { ...game, draw: game.draw.slice(1) },
      { kind: "hidden", teamIndex, card, endsAt },
    ),
  };
}

function nextTeam(game: ActGame): number {
  if (game.phase.kind === "board") return 0;
  return (game.phase.teamIndex + 1) % game.teams.length;
}

function clone(game: ActGame, phase: ActPhase): ActGame {
  return {
    mode: game.mode,
    teams: game.teams.map((team) => ({ ...team })),
    seconds: game.seconds,
    draw: game.draw.map((card) => ({ ...card })),
    phase: phase.kind === "board" ? { kind: "board" } : { ...phase, card: { ...phase.card } },
  };
}

function parseTeams(value: unknown): ActTeam[] | null {
  if (!Array.isArray(value) || value.length < ACT_SETTINGS.teams.min || value.length > ACT_SETTINGS.teams.max) {
    return null;
  }
  const teams: ActTeam[] = [];
  for (const item of value) {
    if (!isRecord(item) || !exactKeys(item, ["id", "name", "score"])) return null;
    if (typeof item.id !== "string" || item.id.length === 0) return null;
    if (typeof item.name !== "string" || item.name !== normalizeName(item.name) || item.name.length === 0) return null;
    if ([...item.name].length > ACT_SETTINGS.nameMax) return null;
    if (typeof item.score !== "number" || !Number.isInteger(item.score) || item.score < 0) return null;
    teams.push({ id: item.id, name: item.name, score: item.score });
  }
  if (new Set(teams.map((team) => team.id)).size !== teams.length) return null;
  return teams;
}

function parseCards(value: unknown): ActCard[] | null {
  if (!Array.isArray(value)) return null;
  const cards: ActCard[] = [];
  for (const item of value) {
    const card = parseCard(item);
    if (!card) return null;
    cards.push(card);
  }
  return cards;
}

function parseCard(value: unknown): ActCard | null {
  if (!isRecord(value) || !exactKeys(value, ["word", "difficulty"])) return null;
  if (typeof value.word !== "string" || value.word.length === 0) return null;
  if (value.difficulty !== "easy" && value.difficulty !== "medium" && value.difficulty !== "hard") return null;
  return { word: value.word, difficulty: value.difficulty };
}

function parsePhase(value: unknown, teamCount: number): ActPhase | null {
  if (!isRecord(value) || typeof value.kind !== "string") return null;
  if (value.kind === "board") {
    if (!exactKeys(value, ["kind"])) return null;
    return { kind: "board" };
  }
  if (value.kind !== "hidden" && value.kind !== "show") return null;
  if (!exactKeys(value, ["kind", "teamIndex", "card", "endsAt"])) return null;
  if (typeof value.teamIndex !== "number" || !Number.isInteger(value.teamIndex) || value.teamIndex < 0 || value.teamIndex >= teamCount) {
    return null;
  }
  if (typeof value.endsAt !== "number" || !Number.isFinite(value.endsAt)) return null;
  const card = parseCard(value.card);
  if (!card) return null;
  return { kind: value.kind, teamIndex: value.teamIndex, card, endsAt: value.endsAt };
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

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const present = Object.keys(value);
  if (present.length !== keys.length) return false;
  return keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
