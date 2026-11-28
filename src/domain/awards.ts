import { AWARD_BANK } from "./awards-bank";
import { normalizeName } from "./participants";
import type { Rng } from "./types";

export interface AwardPerson {
  id: string;
  name: string;
}

export interface AwardVote {
  promptId: string;
  voterId: string;
  choiceId: string;
}

export type AwardsPhase =
  | { kind: "cover"; promptIndex: number; voterIndex: number }
  | { kind: "vote"; promptIndex: number; voterIndex: number }
  | { kind: "results" };

export interface AwardsGame {
  people: AwardPerson[];
  prompts: string[];
  votes: AwardVote[];
  phase: AwardsPhase;
}

export interface AwardTitle {
  name: string;
  titles: string[];
}

export const AWARD_SETTINGS = {
  people: { min: 2, max: 16 },
  count: { min: 1, max: 12, default: 6 },
  nameMax: 40,
} as const;

export type AwardsAction = { kind: "ready" } | { kind: "vote"; choiceId: string };

export type AwardsResult = { ok: true; game: AwardsGame } | { ok: false; reason: string };

export function startAwards(names: readonly string[], count: number, rng: Rng): AwardsResult {
  if (names.length === 0) return { ok: false, reason: "Add at least two people." };
  const cleaned: string[] = [];
  for (const raw of names) {
    const name = normalizeName(raw);
    if (!name) return { ok: false, reason: "Enter a name." };
    if ([...name].length > AWARD_SETTINGS.nameMax) {
      return { ok: false, reason: "Use a shorter name (40 characters or fewer)." };
    }
    if (cleaned.some((existing) => existing.localeCompare(name, undefined, { sensitivity: "accent" }) === 0)) {
      return { ok: false, reason: "That name is already on the list." };
    }
    cleaned.push(name);
  }
  if (cleaned.length < AWARD_SETTINGS.people.min) return { ok: false, reason: "Add at least two people." };
  if (cleaned.length > AWARD_SETTINGS.people.max) return { ok: false, reason: "Use 16 people or fewer." };
  if (!Number.isInteger(count) || count < AWARD_SETTINGS.count.min || count > AWARD_SETTINGS.count.max) {
    return { ok: false, reason: "Set the award count from 1 to 12." };
  }
  return {
    ok: true,
    game: {
      people: cleaned.map((name) => ({ id: crypto.randomUUID(), name })),
      prompts: shuffle(AWARD_BANK.map((prompt) => prompt.id), rng).slice(0, count),
      votes: [],
      phase: { kind: "cover", promptIndex: 0, voterIndex: 0 },
    },
  };
}

export function act(game: AwardsGame, action: AwardsAction): AwardsResult {
  if (game.phase.kind === "results") return { ok: false, reason: "The awards are already up." };
  if (action.kind === "ready") {
    if (game.phase.kind === "vote") return { ok: false, reason: "The vote is already open." };
    return { ok: true, game: clone(game, { kind: "vote", promptIndex: game.phase.promptIndex, voterIndex: game.phase.voterIndex }) };
  }
  if (game.phase.kind === "cover") return { ok: false, reason: "Hand over the phone first." };
  if (!game.people.some((person) => person.id === action.choiceId)) {
    return { ok: false, reason: "Pick someone on the list." };
  }
  const promptId = game.prompts[game.phase.promptIndex];
  const voter = game.people[game.phase.voterIndex];
  if (!promptId || !voter) return { ok: false, reason: "That vote is not in this game." };
  const votes = [...game.votes, { promptId, voterId: voter.id, choiceId: action.choiceId }];
  const voterIndex = game.phase.voterIndex + 1;
  if (voterIndex < game.people.length) {
    return { ok: true, game: clone({ ...game, votes }, { kind: "cover", promptIndex: game.phase.promptIndex, voterIndex }) };
  }
  const promptIndex = game.phase.promptIndex + 1;
  if (promptIndex >= game.prompts.length) return { ok: true, game: clone({ ...game, votes }, { kind: "results" }) };
  return { ok: true, game: clone({ ...game, votes }, { kind: "cover", promptIndex, voterIndex: 0 }) };
}

export function titles(game: AwardsGame): AwardTitle[] | null {
  if (game.phase.kind !== "results") return null;
  return game.people.map((person) => ({
    name: person.name,
    titles: game.prompts
      .filter((promptId) => winners(game, promptId).includes(person.id))
      .map((promptId) => AWARD_BANK.find((prompt) => prompt.id === promptId)?.text ?? "")
      .filter((text) => text.length > 0),
  }));
}

export function promptText(id: string): string {
  return AWARD_BANK.find((prompt) => prompt.id === id)?.text ?? "";
}

export function parseAwards(value: unknown): AwardsGame | null {
  if (!isRecord(value) || !exactKeys(value, ["people", "prompts", "votes", "phase"])) return null;
  const people = parsePeople(value.people);
  const prompts = parsePrompts(value.prompts);
  if (!people || !prompts) return null;
  const ids = new Set(people.map((person) => person.id));
  const promptIds = new Set(prompts);
  const votes = parseVotes(value.votes, ids, promptIds);
  const phase = parsePhase(value.phase, people.length, prompts.length);
  if (!votes || !phase) return null;
  return { people, prompts, votes, phase };
}

function winners(game: AwardsGame, promptId: string): string[] {
  const counts = new Map<string, number>();
  for (const vote of game.votes) {
    if (vote.promptId !== promptId) continue;
    counts.set(vote.choiceId, (counts.get(vote.choiceId) ?? 0) + 1);
  }
  const top = Math.max(0, ...counts.values());
  if (top === 0) return [];
  return game.people.filter((person) => counts.get(person.id) === top).map((person) => person.id);
}

function clone(game: AwardsGame, phase: AwardsPhase): AwardsGame {
  return {
    people: game.people.map((person) => ({ ...person })),
    prompts: [...game.prompts],
    votes: game.votes.map((vote) => ({ ...vote })),
    phase,
  };
}

function parsePeople(value: unknown): AwardPerson[] | null {
  if (!Array.isArray(value) || value.length < AWARD_SETTINGS.people.min || value.length > AWARD_SETTINGS.people.max) {
    return null;
  }
  const people: AwardPerson[] = [];
  for (const item of value) {
    if (!isRecord(item) || !exactKeys(item, ["id", "name"])) return null;
    if (typeof item.id !== "string" || item.id.length === 0) return null;
    if (typeof item.name !== "string" || item.name !== normalizeName(item.name) || item.name.length === 0) return null;
    people.push({ id: item.id, name: item.name });
  }
  if (new Set(people.map((person) => person.id)).size !== people.length) return null;
  return people;
}

function parsePrompts(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > AWARD_SETTINGS.count.max) return null;
  const ids = new Set(AWARD_BANK.map((prompt) => prompt.id));
  if (value.some((id) => typeof id !== "string" || !ids.has(id))) return null;
  if (new Set(value).size !== value.length) return null;
  return value.slice();
}

function parseVotes(value: unknown, people: Set<string>, prompts: Set<string>): AwardVote[] | null {
  if (!Array.isArray(value)) return null;
  const votes: AwardVote[] = [];
  for (const item of value) {
    if (!isRecord(item) || !exactKeys(item, ["promptId", "voterId", "choiceId"])) return null;
    if (typeof item.promptId !== "string" || !prompts.has(item.promptId)) return null;
    if (typeof item.voterId !== "string" || !people.has(item.voterId)) return null;
    if (typeof item.choiceId !== "string" || !people.has(item.choiceId)) return null;
    votes.push({ promptId: item.promptId, voterId: item.voterId, choiceId: item.choiceId });
  }
  return votes;
}

function parsePhase(value: unknown, people: number, prompts: number): AwardsPhase | null {
  if (!isRecord(value) || typeof value.kind !== "string") return null;
  if (value.kind === "results") {
    if (!exactKeys(value, ["kind"])) return null;
    return { kind: "results" };
  }
  if ((value.kind !== "cover" && value.kind !== "vote") || !exactKeys(value, ["kind", "promptIndex", "voterIndex"])) {
    return null;
  }
  if (typeof value.promptIndex !== "number" || !Number.isInteger(value.promptIndex) || value.promptIndex < 0 || value.promptIndex >= prompts) {
    return null;
  }
  if (typeof value.voterIndex !== "number" || !Number.isInteger(value.voterIndex) || value.voterIndex < 0 || value.voterIndex >= people) {
    return null;
  }
  return { kind: value.kind, promptIndex: value.promptIndex, voterIndex: value.voterIndex };
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
