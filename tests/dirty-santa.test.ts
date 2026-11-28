import { describe, expect, it } from "vitest";
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
  type FaceMap,
} from "../src/domain/dirty-santa";

const names = ["Ann", "Bo", "Cy", "Dee"];

function started(rules?: { durationMs?: number; round2?: boolean; faces?: FaceMap }, now = 0): DiceGame {
  const result = startDice(
    names,
    {
      durationMs: rules?.durationMs ?? 180_000,
      round2: rules?.round2 ?? false,
      faces: rules?.faces ?? DEFAULT_FACE_MAP,
    },
    now,
  );
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("start failed");
  return result.game;
}

function numbers(game: DiceGame): number[] {
  const byId = new Map(game.gifts.map((gift) => [gift.id, gift.number]));
  return game.seats.map((seat) => byId.get(seat.giftId) ?? 0);
}

function rolled(game: DiceGame, face: 1 | 2 | 3 | 4 | 5 | 6, now = 0): DiceGame {
  const result = roll(game, face, now);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("roll failed");
  return result.game;
}

describe("dirty santa", () => {
  it("passes one gift left and right, including around the circle", () => {
    const game = started();
    expect(game.seats.map((seat) => seat.name)).toEqual(names);
    expect(numbers(game)).toEqual([1, 2, 3, 4]);

    const left = rolled(game, 1);
    expect(numbers(left)).toEqual([2, 1, 3, 4]);
    expect(left.turn).toBe(1);
    expect(left.phase).toEqual({ kind: "rolling", round: 1 });
    expect(left.seats[left.turn]?.name).toBe("Bo");

    const right = rolled(game, 2);
    expect(numbers(right)).toEqual([4, 2, 3, 1]);
    expect(right.turn).toBe(1);

    let around = game;
    around = rolled(around, 1);
    around = rolled(around, 1);
    around = rolled(around, 1);
    expect(numbers(around)).toEqual([2, 3, 4, 1]);
    expect(around.seats[around.turn]?.name).toBe("Dee");
    around = rolled(around, 1);
    expect(numbers(around)).toEqual([1, 3, 4, 2]);
    expect(around.turn).toBe(0);
    expect(around.phase).toEqual({ kind: "rolling", round: 1 });
    expect(around.seats[around.turn]?.name).toBe("Ann");
  });

  it("moves every gift left or right", () => {
    const game = started();
    const left = rolled(game, 4);
    expect(numbers(left)).toEqual([4, 1, 2, 3]);
    expect(left.turn).toBe(1);
    expect(left.phase).toEqual({ kind: "rolling", round: 1 });

    const right = rolled(game, 5);
    expect(numbers(right)).toEqual([2, 3, 4, 1]);
    expect(right.turn).toBe(1);
  });

  it("keeps the gift and the dice on a keep roll", () => {
    const game = started();
    const kept = rolled(game, 6);
    expect(numbers(kept)).toEqual([1, 2, 3, 4]);
    expect(kept.turn).toBe(0);
    expect(kept.phase.kind).toBe("rolling");
  });

  it("swaps with the chosen person", () => {
    const game = started();
    const waiting = rolled(game, 3);
    expect(numbers(waiting)).toEqual([1, 2, 3, 4]);
    expect(waiting.phase).toEqual({ kind: "chooseSwap", round: 1 });
    expect(waiting.turn).toBe(0);

    const swapped = chooseSwap(waiting, 2, 0);
    expect(swapped.ok).toBe(true);
    if (!swapped.ok) return;
    expect(numbers(swapped.game)).toEqual([3, 2, 1, 4]);
    expect(swapped.game.turn).toBe(1);
    expect(swapped.game.phase).toEqual({ kind: "rolling", round: 1 });
  });

  it("ends the round when the timer hits zero", () => {
    const game = started({ durationMs: 15_000 });
    const before = tick(game, 14_999);
    expect(before.phase).toEqual({ kind: "rolling", round: 1 });
    expect(before.timer.remainingMs).toBe(1);
    expect(tick(before, 14_999)).toBe(before);

    const ended = tick(before, 15_000);
    expect(ended.phase.kind).toBe("done");
    expect(ended.timer.remainingMs).toBe(0);
    expect(ended.timer.deadline).toBeNull();
    expect(tick(ended, 5_000)).toBe(ended);

    const paused = pause(game, 100);
    expect(paused.timer).toEqual({ durationMs: 15_000, remainingMs: 14_900, deadline: null });
    expect(pause(paused, 200)).toBe(paused);

    const running = resume(paused, 100);
    expect(running.timer.deadline).toBe(15_000);
    expect(resume(running, 150)).toBe(running);
    const afterResume = tick(running, 15_000);
    expect(afterResume.phase.kind).toBe("done");

    const late = roll(game, 1, 15_000);
    expect(late.ok).toBe(false);
    expect(numbers(late.game)).toEqual([1, 2, 3, 4]);
    expect(late.game.phase.kind).toBe("done");
  });

  it("opens an optional second round after the first timer ends", () => {
    const game = started({ durationMs: 15_000, round2: true });
    const between = tick(game, 15_000);
    expect(between.phase.kind).toBe("between");
    expect(between.wrapped).toBe(false);
    expect(between.phase.kind).not.toBe("done");

    const second = startRound2(between, 5_000);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.game.phase).toEqual({ kind: "rolling", round: 2 });
    expect(tick(second.game, 20_000).phase.kind).toBe("done");

    const waiting = rolled(game, 3);
    const missed = chooseSwap(waiting, 2, 15_000);
    expect(missed.ok).toBe(false);
    expect(numbers(missed.game)).toEqual([1, 2, 3, 4]);
    expect(missed.game.phase).toEqual({ kind: "between" });
    expect(missed.game.wrapped).toBe(false);
  });

  it("uses the edited face map", () => {
    const faces: FaceMap = { ...DEFAULT_FACE_MAP, 1: "keep" };
    const game = started({ faces });
    const kept = rolled(game, 1);
    expect(numbers(kept)).toEqual([1, 2, 3, 4]);
    expect(kept.turn).toBe(0);
  });

  it("labels a gift only after it is unwrapped", () => {
    const game = started({ durationMs: 15_000, round2: true });
    const gift = game.gifts[0];
    expect(gift).toBeTruthy();
    if (!gift) return;
    const before = JSON.stringify(game);
    const hidden = setLabel(game, gift.id, "socks");
    expect(hidden.ok).toBe(false);
    expect(JSON.stringify(game)).toBe(before);

    const between = tick(game, 15_000);
    const labeled = setLabel(between, gift.id, "socks");
    expect(labeled.ok).toBe(true);
    if (!labeled.ok) return;
    expect(labeled.game.gifts.find((item) => item.number === gift.number)?.label).toBe("socks");
  });

  it("round-trips a game and rejects a bad save", () => {
    const game = rolled(started(), 4);
    expect(parseDice(JSON.parse(JSON.stringify(game)))).toEqual(game);
    const duration = 15_000;
    const paused = pause(started({ durationMs: duration, round2: true }), 1_000);
    expect(parseDice(JSON.parse(JSON.stringify(paused)))).toEqual(paused);
    const between = tick(started({ durationMs: duration, round2: true }), duration);
    expect(parseDice(JSON.parse(JSON.stringify(between)))).toEqual(between);
    const second = startRound2(between, duration);
    if (!second.ok) throw new Error("round 2 did not start");
    expect(parseDice(JSON.parse(JSON.stringify(second.game)))).toEqual(second.game);
    const waiting = rolled(started(), 3);
    expect(parseDice(JSON.parse(JSON.stringify(waiting)))).toEqual(waiting);
    const done = tick(started({ durationMs: duration }), duration);
    expect(parseDice(JSON.parse(JSON.stringify(done)))).toEqual(done);
    expect(parseDice(null)).toBeNull();
  });
});
