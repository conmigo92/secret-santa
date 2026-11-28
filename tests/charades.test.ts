import { describe, expect, it } from "vitest";
import { CHARADES_BANK } from "../src/domain/charades-bank";
import {
  act,
  parseCharades,
  standings,
  startCharades,
  timeUp,
  type ActGame,
} from "../src/domain/charades";
import { mulberry32 } from "./rng";

function started(
  seed: number,
  patch: Partial<{ names: string[]; difficulties: ("easy" | "medium" | "hard")[]; seconds: number; mode: "charades" | "pictionary" }> = {},
  now = 1_000,
): ActGame {
  const result = startCharades(
    {
      names: patch.names ?? ["Red", "Green"],
      mode: patch.mode ?? "charades",
      difficulties: patch.difficulties ?? ["easy"],
      seconds: patch.seconds ?? 60,
    },
    mulberry32(seed),
    now,
  );
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("start failed");
  return result.game;
}

describe("charades bank", () => {
  it("has an easy, medium, and hard pile of actable words", () => {
    expect(CHARADES_BANK.filter((card) => card.difficulty === "easy").length).toBeGreaterThanOrEqual(24);
    expect(CHARADES_BANK.filter((card) => card.difficulty === "medium").length).toBeGreaterThanOrEqual(24);
    expect(CHARADES_BANK.filter((card) => card.difficulty === "hard").length).toBeGreaterThanOrEqual(24);
    const words = CHARADES_BANK.map((card) => card.word);
    expect(new Set(words).size).toBe(words.length);
    expect(words.every((word) => word.length > 0 && word.length <= 40)).toBe(true);
  });
});

describe("charades", () => {
  it("deals only the chosen difficulties, and a different order from a different seed", () => {
    const easy = started(1, { difficulties: ["easy"] });
    expect(easy.phase.kind).toBe("hidden");
    if (easy.phase.kind === "board") return;
    expect([easy.phase.card, ...easy.draw].every((card) => card.difficulty === "easy")).toBe(true);
    const orders = [1, 2, 3, 4].map((seed) => {
      const game = started(seed);
      return game.phase.kind === "board" ? "" : game.phase.card.word;
    });
    expect(new Set(orders).size).toBeGreaterThan(1);
  });

  it("hides the word until reveal, then scores the team and moves on", () => {
    const game = started(3, { seconds: 60 }, 5_000);
    expect(game.phase).toMatchObject({ kind: "hidden", teamIndex: 0, endsAt: 65_000 });
    const before = JSON.stringify(game);
    expect(act(game, { kind: "score", now: 6_000 })).toEqual({ ok: false, reason: "Show the word first." });
    expect(JSON.stringify(game)).toBe(before);
    const shown = act(game, { kind: "reveal" });
    expect(shown.ok).toBe(true);
    if (!shown.ok || shown.game.phase.kind !== "show") return;
    const word = shown.game.phase.card.word;
    const scored = act(shown.game, { kind: "score", now: 8_000 });
    expect(scored.ok).toBe(true);
    if (!scored.ok || scored.game.phase.kind === "board") return;
    expect(scored.game.teams[0]?.score).toBe(1);
    expect(scored.game.phase).toMatchObject({ kind: "hidden", teamIndex: 1, endsAt: 68_000 });
    expect(scored.game.phase.card.word).not.toBe(word);
  });

  it("skips to a new word for the same team and keeps the deadline", () => {
    const game = started(4, { seconds: 45 }, 1_000);
    if (game.phase.kind === "board") throw new Error("phase");
    const skipped = act(game, { kind: "skip" });
    expect(skipped.ok).toBe(true);
    if (!skipped.ok || skipped.game.phase.kind === "board") return;
    expect(skipped.game.phase.teamIndex).toBe(0);
    expect(skipped.game.phase.endsAt).toBe(game.phase.endsAt);
    expect(skipped.game.phase.card.word).not.toBe(game.phase.card.word);
    expect(skipped.game.teams.every((team) => team.score === 0)).toBe(true);
  });

  it("passes the turn without a point and starts a new timer", () => {
    const game = started(5);
    const passed = act(game, { kind: "pass", now: 20_000 });
    expect(passed.ok).toBe(true);
    if (!passed.ok || passed.game.phase.kind === "board") return;
    expect(passed.game.phase.teamIndex).toBe(1);
    expect(passed.game.phase.endsAt).toBe(80_000);
    expect(passed.game.teams.every((team) => team.score === 0)).toBe(true);
  });

  it("opens the board when the pile runs out, and sorts by score then name", () => {
    const game = started(6, { names: ["Zed", "Amy"] });
    const only = { ...game, draw: [] };
    const shown = act(only, { kind: "reveal" });
    if (!shown.ok) throw new Error("reveal");
    const done = act(shown.game, { kind: "score", now: 3_000 });
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    expect(done.game.phase).toEqual({ kind: "board" });
    expect(done.game.teams.find((team) => team.name === "Zed")?.score).toBe(1);
    const ranked = standings({
      ...done.game,
      teams: done.game.teams.map((team) => ({ ...team, score: team.name === "Amy" ? 2 : 1 })),
    });
    expect(ranked.map((team) => team.name)).toEqual(["Amy", "Zed"]);
  });

  it("reads back a saved game and rejects an extra key", () => {
    const game = started(7, { mode: "pictionary", difficulties: ["hard"] });
    expect(game.mode).toBe("pictionary");
    expect(parseCharades(JSON.parse(JSON.stringify(game)))).toEqual(game);
    const extra = JSON.parse(JSON.stringify(game)) as { extra?: boolean };
    extra.extra = true;
    expect(parseCharades(extra)).toBeNull();
  });

  it("rejects one team, no difficulty, and a short timer", () => {
    expect(startCharades({ names: ["Only"], mode: "charades", difficulties: ["easy"], seconds: 60 }, mulberry32(1), 0)).toEqual({
      ok: false,
      reason: "Add at least two teams.",
    });
    expect(startCharades({ names: ["Red", "Green"], mode: "charades", difficulties: [], seconds: 60 }, mulberry32(1), 0)).toEqual({
      ok: false,
      reason: "Pick at least one difficulty.",
    });
    expect(startCharades({ names: ["Green", "green"], mode: "charades", difficulties: ["easy"], seconds: 60 }, mulberry32(1), 0)).toEqual({
      ok: false,
      reason: "That name is already on the list.",
    });
    expect(startCharades({ names: ["Red", "Gold"], mode: "charades", difficulties: ["easy"], seconds: 5 }, mulberry32(1), 0)).toEqual({
      ok: false,
      reason: "Set the timer from 10 to 180 seconds.",
    });
    expect(timeUp(started(1, { seconds: 30 }, 1_000), 31_000)).toBe(true);
  });
});
