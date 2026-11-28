import { normalizeName } from "./participants";
import type { Rng } from "./types";

export interface ElephantRules {
  stealLimit: number;
  finalSwap: boolean;
}

export interface ElephantPlayer {
  id: string;
  name: string;
  order: number;
}

export interface ElephantGift {
  id: string;
  label: string;
  holderId: string;
  steals: number;
}

export type ElephantPhase =
  | { kind: "playing"; currentId: string; bannedGiftId: string | null; nextOrder: number }
  | { kind: "finalSwap"; currentId: string }
  | { kind: "done" };

export interface ElephantGame {
  players: ElephantPlayer[];
  gifts: ElephantGift[];
  rules: ElephantRules;
  phase: ElephantPhase;
}

export type ElephantAction =
  | { kind: "open"; label: string }
  | { kind: "steal"; giftId: string }
  | { kind: "keep" };

export type ElephantResult = { ok: true; game: ElephantGame } | { ok: false; reason: string };

type Playing = Extract<ElephantPhase, { kind: "playing" }>;
type FinalSwap = Extract<ElephantPhase, { kind: "finalSwap" }>;

const MAX_TEXT = 40;

export function startElephant(
  names: readonly string[],
  rules: ElephantRules,
  rng: Rng,
): ElephantResult {
  const cleaned = cleanedNames(names);
  if (!cleaned.ok) return cleaned;
  if (!Number.isInteger(rules.stealLimit) || rules.stealLimit < 1 || rules.stealLimit > 9) {
    return { ok: false, reason: "Set the steal limit from 1 to 9." };
  }

  const players = shuffle(cleaned.names, rng).map((name, index) => ({
    id: crypto.randomUUID(),
    name,
    order: index + 1,
  }));

  return {
    ok: true,
    game: {
      players,
      gifts: [],
      rules: { stealLimit: rules.stealLimit, finalSwap: rules.finalSwap },
      phase: { kind: "playing", currentId: players[0].id, bannedGiftId: null, nextOrder: 1 },
    },
  };
}

export function act(game: ElephantGame, action: ElephantAction): ElephantResult {
  if (game.phase.kind === "done") return { ok: false, reason: "The game is over." };
  switch (action.kind) {
    case "keep":
      return keep(game);
    case "open":
      return openGift(game, action.label);
    case "steal":
      return steal(game, action.giftId);
    default: {
      const never: never = action;
      return never;
    }
  }
}

export function parseElephant(data: unknown): ElephantGame | null {
  if (!isRecord(data) || !exactKeys(data, ["players", "gifts", "rules", "phase"])) return null;
  const players = parsePlayers(data.players);
  const gifts = parseGifts(data.gifts);
  const rules = parseRules(data.rules);
  if (!players || !gifts || !rules) return null;
  if (players.length < 2 || !ordersAreSequence(players) || duplicateName(players)) return null;

  const playerIds = new Set(players.map((player) => player.id));
  const giftIds = new Set(gifts.map((gift) => gift.id));
  if (playerIds.size !== players.length || giftIds.size !== gifts.length) return null;
  if (gifts.some((gift) => !playerIds.has(gift.holderId) || gift.steals > rules.stealLimit)) return null;
  if (new Set(gifts.map((gift) => gift.holderId)).size !== gifts.length) return null;

  const phase = parsePhase(data.phase, playerIds, giftIds);
  if (!phase) return null;
  if (phase.kind === "playing") {
    if (phase.nextOrder < 1 || phase.nextOrder > players.length) return null;
    if (gifts.length !== phase.nextOrder - 1) return null;
    if (gifts.some((gift) => gift.holderId === phase.currentId)) return null;
  } else if (gifts.length !== players.length) {
    return null;
  }

  return { players, gifts, rules, phase };
}

function keep(game: ElephantGame): ElephantResult {
  if (game.phase.kind !== "finalSwap") {
    return { ok: false, reason: "You can keep a gift only on the final swap." };
  }
  return { ok: true, game: nextGame(game, game.gifts, { kind: "done" }) };
}

function openGift(game: ElephantGame, rawLabel: string): ElephantResult {
  if (game.phase.kind !== "playing") return { ok: false, reason: "Every gift is already open." };
  const label = normalizeName(rawLabel);
  if (!label) return { ok: false, reason: "Enter what was in the gift." };
  if ([...label].length > MAX_TEXT) {
    return { ok: false, reason: "Use a shorter label (40 characters or fewer)." };
  }

  const gift: ElephantGift = {
    id: crypto.randomUUID(),
    label,
    holderId: game.phase.currentId,
    steals: 0,
  };
  const opened = advanceAfterOpen({ ...game, gifts: [...game.gifts, gift] }, game.phase);
  if (!opened) return { ok: false, reason: "The game is over." };
  return { ok: true, game: opened };
}

function advanceAfterOpen(game: ElephantGame, phase: Playing): ElephantGame | null {
  const next = phase.nextOrder + 1;
  if (next > game.players.length) {
    if (!game.rules.finalSwap) return nextGame(game, game.gifts, { kind: "done" });
    const first = game.players.find((player) => player.order === 1);
    if (!first) return null;
    return nextGame(game, game.gifts, { kind: "finalSwap", currentId: first.id });
  }
  const nextPlayer = game.players.find((player) => player.order === next);
  if (!nextPlayer) return null;
  return nextGame(game, game.gifts, {
    kind: "playing",
    currentId: nextPlayer.id,
    bannedGiftId: null,
    nextOrder: next,
  });
}

function steal(game: ElephantGame, giftId: string): ElephantResult {
  const phase = game.phase;
  if (phase.kind === "done") return { ok: false, reason: "The game is over." };
  const gift = game.gifts.find((item) => item.id === giftId);
  if (!gift) return { ok: false, reason: "That gift isn't open." };
  if (gift.steals >= game.rules.stealLimit) return { ok: false, reason: "That gift is locked." };
  if (phase.kind === "playing") return stealWhilePlaying(game, phase, gift);
  return swapFinal(game, phase, gift);
}

function stealWhilePlaying(game: ElephantGame, phase: Playing, gift: ElephantGift): ElephantResult {
  if (gift.id === phase.bannedGiftId) return { ok: false, reason: "You can't steal that gift back." };
  if (gift.holderId === phase.currentId) return { ok: false, reason: "You already hold that gift." };
  const gifts = game.gifts.map((item) =>
    item.id === gift.id ? { ...item, holderId: phase.currentId, steals: item.steals + 1 } : item,
  );
  return {
    ok: true,
    game: nextGame(game, gifts, {
      kind: "playing",
      currentId: gift.holderId,
      bannedGiftId: gift.id,
      nextOrder: phase.nextOrder,
    }),
  };
}

function swapFinal(game: ElephantGame, phase: FinalSwap, gift: ElephantGift): ElephantResult {
  if (gift.holderId === phase.currentId) return { ok: false, reason: "You already hold that gift." };
  const mine = game.gifts.find((item) => item.holderId === phase.currentId);
  if (!mine) return { ok: false, reason: "The game is over." };
  const gifts = game.gifts.map((item) => {
    if (item.id === gift.id) return { ...item, holderId: phase.currentId, steals: item.steals + 1 };
    if (item.id === mine.id) return { ...item, holderId: gift.holderId };
    return item;
  });
  return { ok: true, game: nextGame(game, gifts, { kind: "done" }) };
}

function nextGame(game: ElephantGame, gifts: readonly ElephantGift[], phase: ElephantPhase): ElephantGame {
  return {
    players: game.players.map((player) => ({ ...player })),
    gifts: gifts.map((gift) => ({ ...gift })),
    rules: { stealLimit: game.rules.stealLimit, finalSwap: game.rules.finalSwap },
    phase,
  };
}

function cleanedNames(names: readonly string[]): { ok: true; names: string[] } | { ok: false; reason: string } {
  const cleaned: string[] = [];
  for (const raw of names) {
    const name = normalizeName(raw);
    if (!name) return { ok: false, reason: "Enter a name." };
    if ([...name].length > MAX_TEXT) {
      return { ok: false, reason: "Use a shorter name (40 characters or fewer)." };
    }
    const duplicate = cleaned.some(
      (existing) => existing.localeCompare(name, undefined, { sensitivity: "accent" }) === 0,
    );
    if (duplicate) return { ok: false, reason: "That name is already on the list." };
    cleaned.push(name);
  }
  if (cleaned.length < 2) return { ok: false, reason: "Add at least two people." };
  return { ok: true, names: cleaned };
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

function parsePlayers(value: unknown): ElephantPlayer[] | null {
  if (!Array.isArray(value)) return null;
  const players: ElephantPlayer[] = [];
  for (const item of value) {
    if (!isRecord(item) || !exactKeys(item, ["id", "name", "order"])) return null;
    if (typeof item.id !== "string" || item.id.length === 0) return null;
    if (typeof item.name !== "string" || !validText(item.name)) return null;
    if (typeof item.order !== "number" || !Number.isInteger(item.order) || item.order < 1) return null;
    players.push({ id: item.id, name: item.name, order: item.order });
  }
  return players;
}

function parseGifts(value: unknown): ElephantGift[] | null {
  if (!Array.isArray(value)) return null;
  const gifts: ElephantGift[] = [];
  for (const item of value) {
    if (!isRecord(item) || !exactKeys(item, ["id", "label", "holderId", "steals"])) return null;
    if (typeof item.id !== "string" || item.id.length === 0) return null;
    if (typeof item.label !== "string" || !validText(item.label)) return null;
    if (typeof item.holderId !== "string" || item.holderId.length === 0) return null;
    if (typeof item.steals !== "number" || !Number.isInteger(item.steals) || item.steals < 0) return null;
    gifts.push({ id: item.id, label: item.label, holderId: item.holderId, steals: item.steals });
  }
  return gifts;
}

function parseRules(value: unknown): ElephantRules | null {
  if (!isRecord(value) || !exactKeys(value, ["stealLimit", "finalSwap"])) return null;
  if (typeof value.stealLimit !== "number" || !Number.isInteger(value.stealLimit)) return null;
  if (value.stealLimit < 1 || value.stealLimit > 9) return null;
  if (typeof value.finalSwap !== "boolean") return null;
  return { stealLimit: value.stealLimit, finalSwap: value.finalSwap };
}

function parsePhase(value: unknown, playerIds: Set<string>, giftIds: Set<string>): ElephantPhase | null {
  if (!isRecord(value) || typeof value.kind !== "string") return null;
  if (value.kind === "done") {
    if (!exactKeys(value, ["kind"])) return null;
    return { kind: "done" };
  }
  if (typeof value.currentId !== "string" || !playerIds.has(value.currentId)) return null;
  if (value.kind === "finalSwap") {
    if (!exactKeys(value, ["kind", "currentId"])) return null;
    return { kind: "finalSwap", currentId: value.currentId };
  }
  if (value.kind !== "playing" || !exactKeys(value, ["kind", "currentId", "bannedGiftId", "nextOrder"])) {
    return null;
  }
  if (typeof value.nextOrder !== "number" || !Number.isInteger(value.nextOrder)) return null;
  if (value.bannedGiftId === null) {
    return { kind: "playing", currentId: value.currentId, bannedGiftId: null, nextOrder: value.nextOrder };
  }
  if (typeof value.bannedGiftId !== "string" || !giftIds.has(value.bannedGiftId)) return null;
  return {
    kind: "playing",
    currentId: value.currentId,
    bannedGiftId: value.bannedGiftId,
    nextOrder: value.nextOrder,
  };
}

function ordersAreSequence(players: readonly ElephantPlayer[]): boolean {
  const orders = new Set(players.map((player) => player.order));
  if (orders.size !== players.length) return false;
  for (let order = 1; order <= players.length; order++) {
    if (!orders.has(order)) return false;
  }
  return true;
}

function duplicateName(players: readonly ElephantPlayer[]): boolean {
  return players.some((player, index) =>
    players
      .slice(index + 1)
      .some((other) => player.name.localeCompare(other.name, undefined, { sensitivity: "accent" }) === 0),
  );
}

function validText(value: string): boolean {
  return value.length > 0 && value === normalizeName(value) && [...value].length <= MAX_TEXT;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const present = Object.keys(value);
  if (present.length !== keys.length) return false;
  return keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
