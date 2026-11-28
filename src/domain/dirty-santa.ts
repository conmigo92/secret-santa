import { normalizeName } from "./participants";

export type Face = 1 | 2 | 3 | 4 | 5 | 6;

export type FaceEffect = "passLeft" | "passRight" | "swapAny" | "allLeft" | "allRight" | "keep";

export type FaceMap = Record<Face, FaceEffect>;

export const DEFAULT_FACE_MAP: FaceMap = {
  1: "passLeft",
  2: "passRight",
  3: "swapAny",
  4: "allLeft",
  5: "allRight",
  6: "keep",
};

export interface DiceRules {
  durationMs: number;
  round2: boolean;
  faces: FaceMap;
}

export interface DiceSeat {
  id: string;
  name: string;
  giftId: string;
}

export interface DiceGift {
  id: string;
  number: number;
  label: string;
}

export type DicePhase =
  | { kind: "rolling"; round: 1 | 2 }
  | { kind: "chooseSwap"; round: 1 | 2 }
  | { kind: "between" }
  | { kind: "done" };

export interface DiceTimer {
  durationMs: number;
  remainingMs: number;
  deadline: number | null;
}

export interface DiceGame {
  seats: DiceSeat[];
  gifts: DiceGift[];
  turn: number;
  phase: DicePhase;
  faces: FaceMap;
  round2: boolean;
  wrapped: boolean;
  timer: DiceTimer;
}

export type DiceResult = { ok: true; game: DiceGame } | { ok: false; reason: string; game: DiceGame };

const FACES: Face[] = [1, 2, 3, 4, 5, 6];

export function startDice(names: readonly string[], rules: DiceRules, now: number): DiceResult {
  const cleaned = cleanedNames(names);
  if (!cleaned.ok) return { ...cleaned, game: emptyGame(rules, now) };
  if (!Number.isInteger(rules.durationMs) || rules.durationMs < 15_000 || rules.durationMs > 1_800_000) {
    return { ok: false, reason: "Set the round from 15 seconds to 30 minutes.", game: emptyGame(rules, now) };
  }
  if (!validFaces(rules.faces)) {
    return { ok: false, reason: "Each face needs an action.", game: emptyGame(rules, now) };
  }

  const seats: DiceSeat[] = [];
  const gifts: DiceGift[] = [];
  for (const name of cleaned.names) {
    const giftId = crypto.randomUUID();
    gifts.push({ id: giftId, number: gifts.length + 1, label: "" });
    seats.push({ id: crypto.randomUUID(), name, giftId });
  }

  return {
    ok: true,
    game: {
      seats,
      gifts,
      turn: 0,
      phase: { kind: "rolling", round: 1 },
      faces: {
        1: rules.faces[1],
        2: rules.faces[2],
        3: rules.faces[3],
        4: rules.faces[4],
        5: rules.faces[5],
        6: rules.faces[6],
      },
      round2: rules.round2,
      wrapped: true,
      timer: { durationMs: rules.durationMs, remainingMs: rules.durationMs, deadline: now + rules.durationMs },
    },
  };
}

export function tick(game: DiceGame, now: number): DiceGame {
  if (game.phase.kind === "done" || game.phase.kind === "between") return game;
  if (game.timer.deadline === null) return game;
  if (now < game.timer.deadline) {
    const remainingMs = game.timer.deadline - now;
    if (remainingMs === game.timer.remainingMs) return game;
    return { ...game, timer: { ...game.timer, remainingMs } };
  }
  return endRound(game);
}

export function pause(game: DiceGame, now: number): DiceGame {
  if (game.phase.kind === "done" || game.phase.kind === "between") return game;
  if (game.timer.deadline === null) return game;
  const remainingMs = Math.max(0, game.timer.deadline - now);
  if (remainingMs === 0) return endRound(game);
  return { ...game, timer: { ...game.timer, remainingMs, deadline: null } };
}

export function resume(game: DiceGame, now: number): DiceGame {
  if (game.phase.kind === "done" || game.phase.kind === "between") return game;
  if (game.timer.deadline !== null) return game;
  if (game.timer.remainingMs <= 0) return endRound(game);
  return { ...game, timer: { ...game.timer, deadline: now + game.timer.remainingMs } };
}

export function roll(game: DiceGame, face: Face, now: number): DiceResult {
  const ticked = tick(game, now);
  if (ticked.phase.kind !== "rolling") {
    const reason = ticked.phase.kind === "chooseSwap" ? "Finish the swap before you roll." : "The round is over.";
    return { ok: false, reason, game: ticked };
  }
  return { ok: true, game: applyFace(ticked, ticked.faces[face], ticked.phase.round) };
}

export function chooseSwap(game: DiceGame, seatIndex: number, now: number): DiceResult {
  const ticked = tick(game, now);
  if (ticked.phase.kind !== "chooseSwap") {
    return { ok: false, reason: "The round is over.", game: ticked };
  }
  if (!Number.isInteger(seatIndex) || seatIndex < 0 || seatIndex >= ticked.seats.length) {
    return { ok: false, reason: "That gift isn't in the game.", game: ticked };
  }
  if (seatIndex === ticked.turn) {
    return { ok: false, reason: "Pick someone else.", game: ticked };
  }
  return {
    ok: true,
    game: {
      ...ticked,
      seats: swapSeats(ticked.seats, ticked.turn, seatIndex),
      turn: leftOf(ticked.turn, ticked.seats.length),
      phase: { kind: "rolling", round: ticked.phase.round },
    },
  };
}

export function setLabel(game: DiceGame, giftId: string, label: string): DiceResult {
  if (game.wrapped) return { ok: false, reason: "Labels wait until the gifts are unwrapped.", game };
  const text = normalizeName(label);
  if ([...text].length > 40) return { ok: false, reason: "Use a shorter label (40 characters or fewer).", game };
  const gift = game.gifts.find((item) => item.id === giftId);
  if (!gift) return { ok: false, reason: "That gift isn't in the game.", game };
  if (gift.label === text) return { ok: true, game };
  return {
    ok: true,
    game: {
      ...game,
      gifts: game.gifts.map((item) => (item.id === giftId ? { ...item, label: text } : item)),
    },
  };
}

export function startRound2(game: DiceGame, now: number): DiceResult {
  if (game.phase.kind !== "between") return { ok: false, reason: "Round 2 is not ready.", game };
  return {
    ok: true,
    game: {
      ...game,
      phase: { kind: "rolling", round: 2 },
      timer: {
        durationMs: game.timer.durationMs,
        remainingMs: game.timer.durationMs,
        deadline: now + game.timer.durationMs,
      },
    },
  };
}

export function parseDice(data: unknown): DiceGame | null {
  if (!isRecord(data) || !exactKeys(data, ["seats", "gifts", "turn", "phase", "faces", "round2", "wrapped", "timer"])) {
    return null;
  }
  const seats = parseSeats(data.seats);
  const gifts = parseGifts(data.gifts);
  const timer = parseTimer(data.timer);
  const phase = parsePhase(data.phase);
  const faces = parseFaces(data.faces);
  if (!seats || !gifts || !timer || !phase || !faces) return null;
  if (typeof data.turn !== "number" || !Number.isInteger(data.turn) || data.turn < 0 || data.turn >= seats.length) {
    return null;
  }
  if (typeof data.round2 !== "boolean" || typeof data.wrapped !== "boolean") return null;
  if (seats.length < 2 || gifts.length !== seats.length || !holdsMatch(seats, gifts)) return null;

  const game: DiceGame = {
    seats,
    gifts,
    turn: data.turn,
    phase,
    faces,
    round2: data.round2,
    wrapped: data.wrapped,
    timer,
  };
  return playable(game) ? game : null;
}

function applyFace(game: DiceGame, effect: FaceEffect, round: 1 | 2): DiceGame {
  const count = game.seats.length;
  if (effect === "keep") return game;
  if (effect === "swapAny") return { ...game, phase: { kind: "chooseSwap", round } };
  if (effect === "passLeft") {
    return move(game, swapSeats(game.seats, game.turn, leftOf(game.turn, count)));
  }
  if (effect === "passRight") {
    return move(game, swapSeats(game.seats, game.turn, rightOf(game.turn, count)));
  }
  if (effect === "allLeft") return move(game, rotate(game.seats, "left"));
  if (effect === "allRight") return move(game, rotate(game.seats, "right"));
  const unreachable: never = effect;
  return unreachable;
}

function move(game: DiceGame, seats: DiceSeat[]): DiceGame {
  return { ...game, seats, turn: leftOf(game.turn, seats.length) };
}

function endRound(game: DiceGame): DiceGame {
  const round = game.phase.kind === "rolling" || game.phase.kind === "chooseSwap" ? game.phase.round : 2;
  if (round === 1 && game.round2) {
    return {
      ...game,
      wrapped: false,
      turn: 0,
      phase: { kind: "between" },
      timer: { ...game.timer, remainingMs: game.timer.durationMs, deadline: null },
    };
  }
  return { ...game, phase: { kind: "done" }, timer: { ...game.timer, remainingMs: 0, deadline: null } };
}

function rotate(seats: readonly DiceSeat[], direction: "left" | "right"): DiceSeat[] {
  const count = seats.length;
  return seats.map((seat, index) => {
    const source = direction === "left" ? rightOf(index, count) : leftOf(index, count);
    const from = seats[source];
    return from ? { ...seat, giftId: from.giftId } : seat;
  });
}

function swapSeats(seats: readonly DiceSeat[], left: number, right: number): DiceSeat[] {
  const first = seats[left];
  const second = seats[right];
  if (!first || !second) return [...seats];
  return seats.map((seat, index) => {
    if (index === left) return { ...seat, giftId: second.giftId };
    if (index === right) return { ...seat, giftId: first.giftId };
    return seat;
  });
}

function leftOf(index: number, count: number): number {
  return (index + 1) % count;
}

function rightOf(index: number, count: number): number {
  return (index - 1 + count) % count;
}

function validFaces(faces: Partial<FaceMap>): faces is FaceMap {
  return FACES.every((face) => isEffect(faces[face]));
}

function parseFaces(value: unknown): FaceMap | null {
  if (!isRecord(value) || !exactKeys(value, ["1", "2", "3", "4", "5", "6"])) return null;
  const one = isEffect(value["1"]) ? value["1"] : null;
  const two = isEffect(value["2"]) ? value["2"] : null;
  const three = isEffect(value["3"]) ? value["3"] : null;
  const four = isEffect(value["4"]) ? value["4"] : null;
  const five = isEffect(value["5"]) ? value["5"] : null;
  const six = isEffect(value["6"]) ? value["6"] : null;
  if (!one || !two || !three || !four || !five || !six) return null;
  return { 1: one, 2: two, 3: three, 4: four, 5: five, 6: six };
}

function isEffect(value: unknown): value is FaceEffect {
  return (
    value === "passLeft" ||
    value === "passRight" ||
    value === "swapAny" ||
    value === "allLeft" ||
    value === "allRight" ||
    value === "keep"
  );
}

function cleanedNames(names: readonly string[]): { ok: true; names: string[] } | { ok: false; reason: string } {
  const cleaned: string[] = [];
  for (const raw of names) {
    const name = normalizeName(raw);
    if (!name) return { ok: false, reason: "Enter a name." };
    if ([...name].length > 40) return { ok: false, reason: "Use a shorter name (40 characters or fewer)." };
    const duplicate = cleaned.some(
      (existing) => existing.localeCompare(name, undefined, { sensitivity: "accent" }) === 0,
    );
    if (duplicate) return { ok: false, reason: "That name is already on the list." };
    cleaned.push(name);
  }
  if (cleaned.length < 2) return { ok: false, reason: "Add at least two people." };
  return { ok: true, names: cleaned };
}

function emptyGame(rules: DiceRules, now: number): DiceGame {
  const duration = Number.isFinite(rules.durationMs) ? rules.durationMs : 0;
  return {
    seats: [],
    gifts: [],
    turn: 0,
    phase: { kind: "done" },
    faces: validFaces(rules.faces) ? { ...rules.faces } : { ...DEFAULT_FACE_MAP },
    round2: rules.round2,
    wrapped: true,
    timer: { durationMs: duration, remainingMs: duration, deadline: now },
  };
}

function parseSeats(value: unknown): DiceSeat[] | null {
  if (!Array.isArray(value)) return null;
  const seats: DiceSeat[] = [];
  for (const item of value) {
    if (!isRecord(item) || !exactKeys(item, ["id", "name", "giftId"])) return null;
    if (typeof item.id !== "string" || typeof item.name !== "string" || typeof item.giftId !== "string") return null;
    if (!item.id || !item.giftId || normalizeName(item.name) !== item.name) return null;
    if ([...item.name].length > 40) return null;
    seats.push({ id: item.id, name: item.name, giftId: item.giftId });
  }
  return seats;
}

function parseGifts(value: unknown): DiceGift[] | null {
  if (!Array.isArray(value)) return null;
  const gifts: DiceGift[] = [];
  for (const item of value) {
    if (!isRecord(item) || !exactKeys(item, ["id", "number", "label"])) return null;
    if (typeof item.id !== "string" || typeof item.label !== "string" || !item.id) return null;
    if (typeof item.number !== "number" || !Number.isInteger(item.number) || item.number < 1) return null;
    if (normalizeName(item.label) !== item.label || [...item.label].length > 40) return null;
    gifts.push({ id: item.id, number: item.number, label: item.label });
  }
  return gifts;
}

function parseTimer(value: unknown): DiceTimer | null {
  if (!isRecord(value) || !exactKeys(value, ["durationMs", "remainingMs", "deadline"])) return null;
  if (typeof value.durationMs !== "number" || typeof value.remainingMs !== "number") return null;
  if (!Number.isInteger(value.durationMs) || value.durationMs < 15_000 || value.durationMs > 1_800_000) return null;
  if (!Number.isFinite(value.remainingMs) || value.remainingMs < 0) return null;
  if (value.deadline !== null && (typeof value.deadline !== "number" || !Number.isFinite(value.deadline))) return null;
  return { durationMs: value.durationMs, remainingMs: value.remainingMs, deadline: value.deadline };
}

function parsePhase(value: unknown): DicePhase | null {
  if (!isRecord(value)) return null;
  if (value.kind === "between" && exactKeys(value, ["kind"])) return { kind: "between" };
  if (value.kind === "done" && exactKeys(value, ["kind"])) return { kind: "done" };
  if (value.kind !== "rolling" && value.kind !== "chooseSwap") return null;
  if (!exactKeys(value, ["kind", "round"])) return null;
  if (value.round !== 1 && value.round !== 2) return null;
  if (value.kind === "rolling") return { kind: "rolling", round: value.round };
  return { kind: "chooseSwap", round: value.round };
}

function holdsMatch(seats: readonly DiceSeat[], gifts: readonly DiceGift[]): boolean {
  const giftIds = new Set(gifts.map((gift) => gift.id));
  const held = seats.map((seat) => seat.giftId);
  if (giftIds.size !== gifts.length || new Set(held).size !== held.length) return false;
  if (held.some((giftId) => !giftIds.has(giftId))) return false;
  const seatIds = new Set(seats.map((seat) => seat.id));
  if (seatIds.size !== seats.length) return false;
  for (let index = 0; index < seats.length; index += 1) {
    const name = seats[index]?.name;
    if (!name) return false;
    const duplicate = seats.slice(index + 1).some(
      (seat) => seat.name.localeCompare(name, undefined, { sensitivity: "accent" }) === 0,
    );
    if (duplicate) return false;
  }
  for (let number = 1; number <= gifts.length; number += 1) {
    if (!gifts.some((gift) => gift.number === number)) return false;
  }
  return true;
}

function playable(game: DiceGame): boolean {
  const timer = game.timer;
  if (game.phase.kind === "between") {
    return (
      game.round2 &&
      !game.wrapped &&
      game.turn === 0 &&
      timer.deadline === null &&
      timer.remainingMs === timer.durationMs
    );
  }
  if (game.phase.kind === "done") return timer.deadline === null && timer.remainingMs === 0;
  if (game.phase.round === 1 && !game.wrapped) return false;
  if (game.phase.round === 2 && (!game.round2 || game.wrapped)) return false;
  if (timer.deadline === null && timer.remainingMs <= 0) return false;
  return true;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const present = Object.keys(value);
  return present.length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
