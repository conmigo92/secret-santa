import { describe, expect, it } from "vitest";
import { RATHER_BANK } from "../src/domain/rather-bank";
import { act, parseRather, promptAt, startRather } from "../src/domain/rather";
import { mulberry32 } from "./rng";

describe("would you rather", () => {
  it("has 80 or more prompts with two different sides", () => {
    expect(RATHER_BANK.length).toBeGreaterThanOrEqual(80);
    const ids = RATHER_BANK.map((prompt) => prompt.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const prompt of RATHER_BANK) {
      expect(prompt.left.length).toBeGreaterThan(0);
      expect(prompt.right.length).toBeGreaterThan(0);
      expect(prompt.left).not.toBe(prompt.right);
    }
  });

  it("shuffles, counts a show of hands, and will not go below zero", () => {
    const first = startRather(mulberry32(1));
    const second = startRather(mulberry32(2));
    expect(first.order.join()).not.toBe(second.order.join());
    expect(first.order).toEqual(startRather(mulberry32(1)).order);
    const up = act(first, { kind: "hand", side: "left", delta: 1 });
    expect(up.ok && up.game.left).toBe(1);
    if (!up.ok) return;
    const down = act(up.game, { kind: "hand", side: "left", delta: -1 });
    expect(down.ok && down.game.left).toBe(0);
    if (!down.ok) return;
    const again = act(down.game, { kind: "hand", side: "right", delta: -1 });
    expect(again.ok && again.game.right).toBe(0);
  });

  it("resets the tally on the next prompt and ends after the last one", () => {
    const game = startRather(mulberry32(3));
    const raised = act(game, { kind: "hand", side: "left", delta: 1 });
    if (!raised.ok) throw new Error("hand");
    const next = act(raised.game, { kind: "next" });
    expect(next.ok).toBe(true);
    if (!next.ok) return;
    expect(next.game.index).toBe(1);
    expect(next.game.left).toBe(0);
    expect(promptAt(next.game)?.id).toBe(next.game.order[1]);
    const last = { ...next.game, index: next.game.order.length - 1, left: 4, right: 2 };
    const done = act(last, { kind: "next" });
    expect(done.ok && done.game.done).toBe(true);
    expect(parseRather(JSON.parse(JSON.stringify(next.game)))).toEqual(next.game);
  });
});
