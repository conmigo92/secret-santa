import { describe, expect, it } from "vitest";
import {
  act,
  checkCustom,
  parseTrivia,
  standings,
  startTrivia,
  timeUp,
  type TriviaGame,
} from "../src/domain/trivia";
import { mulberry32 } from "./rng";

const choice = ["North", "South", "East", "West"] as const;

function started(
  seed: number,
  patch: Partial<{ names: string[]; count: number; seconds: number; custom: { prompt: string; choices: readonly [string, string, string, string]; answer: 0 | 1 | 2 | 3 }[] }> = {},
  now = 1_000,
): TriviaGame {
  const result = startTrivia(
    {
      names: patch.names ?? ["Ada", "Bea"],
      custom: patch.custom ?? [],
      seconds: patch.seconds ?? 30,
      count: patch.count ?? 10,
    },
    mulberry32(seed),
    now,
  );
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("start failed");
  return result.game;
}

function ids(game: TriviaGame): string[] {
  return game.questions.map((question) => question.id);
}

describe("christmas trivia", () => {
  it("deals a different bank order from a different seed, and the same order from the same seed", () => {
    const orders = [1, 2, 3, 4, 5].map((seed) => ids(started(seed)).join(","));
    expect(new Set(orders).size).toBeGreaterThan(1);
    expect(ids(started(1))).toEqual(ids(started(1)));
  });

  it("keeps every custom question in the deck", () => {
    const game = started(2, {
      count: 4,
      custom: [
        { prompt: "Custom one", choices: ["A", "B", "C", "D"], answer: 1 },
        { prompt: "Custom two", choices: ["E", "F", "G", "H"], answer: 0 },
      ],
    });
    expect(game.questions).toHaveLength(4);
    expect(game.questions.map((question) => question.prompt)).toEqual(
      expect.arrayContaining(["Custom one", "Custom two"]),
    );
    expect(game.questions.filter((question) => question.topic === "custom").map((question) => question.id).sort()).toEqual([
      "c1",
      "c2",
    ]);
  });

  it("refuses a count that drops a custom question", () => {
    const result = startTrivia(
      {
        names: ["Ada"],
        seconds: 30,
        count: 2,
        custom: [
          { prompt: "One", choices: ["A", "B", "C", "D"], answer: 0 },
          { prompt: "Two", choices: ["E", "F", "G", "H"], answer: 1 },
          { prompt: "Three", choices: ["I", "J", "K", "L"], answer: 2 },
        ],
      },
      mulberry32(1),
      0,
    );
    expect(result).toEqual({
      ok: false,
      reason: "Raise the question count to fit your custom questions, or remove one.",
    });
  });

  it("stores no deadline when the timer is 0, and a deadline when it is not", () => {
    const open = started(1, { seconds: 0 }, 5_000);
    const timed = started(1, { seconds: 30 }, 1_000);
    expect(open.phase).toEqual({ kind: "ask", index: 0, endsAt: null });
    expect(timed.phase).toEqual({ kind: "ask", index: 0, endsAt: 31_000 });
  });

  it("gives one point, and only once, after the answer is up", () => {
    const game = started(3, { count: 2, seconds: 0 });
    const before = JSON.stringify(game);
    expect(act(game, { kind: "point", playerId: game.players[0]!.id }).ok).toBe(false);
    expect(JSON.stringify(game)).toBe(before);

    const shown = act(game, { kind: "reveal" });
    expect(shown.ok).toBe(true);
    if (!shown.ok) return;
    const ada = shown.game.players[0]!;
    const scored = act(shown.game, { kind: "point", playerId: ada.id });
    expect(scored.ok).toBe(true);
    if (!scored.ok) return;
    expect(scored.game.players.find((player) => player.id === ada.id)?.score).toBe(1);
    expect(scored.game.phase).toEqual({ kind: "answer", index: 0, scored: true });
    expect(act(scored.game, { kind: "point", playerId: ada.id })).toEqual({
      ok: false,
      reason: "That question already has a score.",
    });

    const passed = act(shown.game, { kind: "point", playerId: null });
    expect(passed.ok).toBe(true);
    if (!passed.ok) return;
    expect(passed.game.players.every((player) => player.score === 0)).toBe(true);
    expect(passed.game.phase).toMatchObject({ scored: true });
  });

  it("moves on only after a point, and opens the board after the last question", () => {
    const game = started(4, { count: 2, seconds: 30 });
    const shown = act(game, { kind: "reveal" });
    if (!shown.ok) throw new Error("reveal");
    expect(act(shown.game, { kind: "next", now: 9_000 })).toEqual({
      ok: false,
      reason: "Give the point before the next question.",
    });
    const scored = act(shown.game, { kind: "point", playerId: null });
    if (!scored.ok) throw new Error("point");
    const moved = act(scored.game, { kind: "next", now: 9_000 });
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(moved.game.phase).toEqual({ kind: "ask", index: 1, endsAt: 39_000 });

    const lastShown = act(moved.game, { kind: "reveal" });
    if (!lastShown.ok) throw new Error("reveal 2");
    const lastScored = act(lastShown.game, { kind: "point", playerId: lastShown.game.players[1]!.id });
    if (!lastScored.ok) throw new Error("point 2");
    const done = act(lastScored.game, { kind: "next", now: 10_000 });
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    expect(done.game.phase).toEqual({ kind: "board" });
    expect(done.game.players.find((player) => player.name === "Bea")?.score).toBe(1);
  });

  it("ends from a question and keeps the points already given", () => {
    const game = started(5, { count: 4, seconds: 0 });
    const shown = act(game, { kind: "reveal" });
    if (!shown.ok) throw new Error("reveal");
    const scored = act(shown.game, { kind: "point", playerId: shown.game.players[0]!.id });
    if (!scored.ok) throw new Error("point");
    const ended = act(scored.game, { kind: "end" });
    expect(ended.ok).toBe(true);
    if (!ended.ok) return;
    expect(ended.game.phase).toEqual({ kind: "board" });
    expect(ended.game.players[0]?.score).toBe(1);
    expect(act(ended.game, { kind: "end" })).toEqual({ ok: false, reason: "The game is already over." });
  });

  it("sorts the board by score, then by name", () => {
    const game = started(6, { names: ["Cara", "Ada", "Bea"], count: 1, seconds: 0 });
    const players = game.players.map((player, index) => ({ ...player, score: index === 0 ? 1 : 3 }));
    const ranked = standings({ ...game, players });
    expect(ranked.map((player) => `${player.name}:${player.score}`)).toEqual(["Ada:3", "Bea:3", "Cara:1"]);
  });

  it("reads back a saved game and rejects an extra key", () => {
    const game = started(7);
    expect(parseTrivia(JSON.parse(JSON.stringify(game)))).toEqual(game);
    const extra = JSON.parse(JSON.stringify(game)) as { extra?: boolean };
    extra.extra = true;
    expect(parseTrivia(extra)).toBeNull();
  });

  it("rejects duplicate names and a bad custom question", () => {
    const names = startTrivia(
      { names: ["Ada", "ada"], custom: [], seconds: 30, count: 5 },
      mulberry32(1),
      0,
    );
    expect(names).toEqual({ ok: false, reason: "That name is already on the list." });
    expect(checkCustom({ prompt: "  ", choices: choice, answer: 0 })).toEqual({
      ok: false,
      reason: "Enter a question.",
    });
    expect(checkCustom({ prompt: "Same", choices: ["A", "a", "B", "C"], answer: 0 })).toEqual({
      ok: false,
      reason: "Enter four different choices.",
    });
  });

  it("knows when the question timer has run out", () => {
    const game = started(8, { seconds: 30 }, 1_000);
    expect(timeUp(game, 30_999)).toBe(false);
    expect(timeUp(game, 31_000)).toBe(true);
    const open = started(8, { seconds: 0 }, 1_000);
    expect(timeUp(open, 99_000)).toBe(false);
  });
});
