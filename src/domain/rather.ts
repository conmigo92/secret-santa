import { RATHER_BANK, type RatherPrompt } from "./rather-bank";
import type { Rng } from "./types";

export interface RatherGame {
  order: string[];
  index: number;
  left: number;
  right: number;
  done: boolean;
}

export type RatherAction =
  | { kind: "hand"; side: "left" | "right"; delta: 1 | -1 }
  | { kind: "next" };

export type RatherResult = { ok: true; game: RatherGame } | { ok: false; reason: string };

export function startRather(rng: Rng): RatherGame {
  return {
    order: shuffle(RATHER_BANK.map((prompt) => prompt.id), rng),
    index: 0,
    left: 0,
    right: 0,
    done: false,
  };
}

export function promptAt(game: RatherGame): RatherPrompt | null {
  if (game.done) return null;
  const id = game.order[game.index];
  return RATHER_BANK.find((prompt) => prompt.id === id) ?? null;
}

export function act(game: RatherGame, action: RatherAction): RatherResult {
  if (game.done) return { ok: false, reason: "That was the last prompt." };
  if (action.kind === "next") {
    const index = game.index + 1;
    if (index >= game.order.length) return { ok: true, game: { ...game, done: true, left: 0, right: 0 } };
    return { ok: true, game: { ...game, index, left: 0, right: 0 } };
  }
  const key = action.side;
  const next = Math.max(0, game[key] + action.delta);
  return { ok: true, game: { ...game, [key]: next } };
}

export function parseRather(value: unknown): RatherGame | null {
  if (!isRecord(value) || !exactKeys(value, ["order", "index", "left", "right", "done"])) return null;
  if (!Array.isArray(value.order) || value.order.length !== RATHER_BANK.length) return null;
  const ids = new Set(RATHER_BANK.map((prompt) => prompt.id));
  if (value.order.some((id) => typeof id !== "string" || !ids.has(id))) return null;
  if (new Set(value.order).size !== value.order.length) return null;
  if (typeof value.index !== "number" || !Number.isInteger(value.index) || value.index < 0 || value.index >= value.order.length) {
    return null;
  }
  if (!count(value.left) || !count(value.right) || typeof value.done !== "boolean") return null;
  if (value.done && (value.left !== 0 || value.right !== 0)) return null;
  return { order: value.order.slice(), index: value.index, left: value.left, right: value.right, done: value.done };
}

function count(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 999;
}

function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.min(0.999999, Math.max(0, rng())) * (i + 1));
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
