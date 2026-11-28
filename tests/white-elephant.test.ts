import { describe, expect, it } from "vitest";
import {
  act,
  parseElephant,
  startElephant,
  type ElephantGame,
  type ElephantResult,
} from "../src/domain/white-elephant";
import { mulberry32 } from "./rng";

const people = ["Ada", "Bea", "Cal", "Dee"];

function game(
  names: string[],
  rules: { stealLimit: number; finalSwap: boolean },
  seed = 1,
): ElephantGame {
  const started = startElephant(names, rules, mulberry32(seed));
  expect(started.ok).toBe(true);
  if (!started.ok) throw new Error("start failed");
  return started.game;
}

function open(current: ElephantGame, label: string): ElephantGame {
  return played(act(current, { kind: "open", label }));
}

function steal(current: ElephantGame, label: string): ElephantGame {
  const gift = current.gifts.find((item) => item.label === label);
  expect(gift).toBeTruthy();
  if (!gift) throw new Error(label);
  return played(act(current, { kind: "steal", giftId: gift.id }));
}

function played(result: ElephantResult): ElephantGame {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("action failed");
  return result.game;
}

function orderNames(current: ElephantGame): string[] {
  return [...current.players].sort((a, b) => a.order - b.order).map((player) => player.name);
}

function currentName(current: ElephantGame): string {
  const phase = current.phase;
  if (phase.kind === "done") return "";
  return current.players.find((player) => player.id === phase.currentId)?.name ?? "";
}

function holder(current: ElephantGame, label: string): string {
  const gift = current.gifts.find((item) => item.label === label);
  return current.players.find((player) => player.id === gift?.holderId)?.name ?? "";
}

function stealsOf(current: ElephantGame, label: string): number {
  return current.gifts.find((item) => item.label === label)?.steals ?? -1;
}

describe("white elephant", () => {
  it("shuffles a numbered turn order and starts with player 1", () => {
    const rules = { stealLimit: 3, finalSwap: false };
    const first = game(people, rules, 4);
    const second = game(people, rules, 4);
    expect(orderNames(first)).toEqual(orderNames(second));
    expect(first.players.map((player) => player.order).sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
    expect(first.phase.kind).toBe("playing");
    expect(currentName(first)).toBe(orderNames(first)[0]);

    const before = JSON.stringify(first);
    const blocked = act(first, { kind: "steal", giftId: "missing" });
    expect(blocked.ok).toBe(false);
    expect(JSON.stringify(first)).toBe(before);
    const kept = act(first, { kind: "keep" });
    expect(kept.ok).toBe(false);
    expect(JSON.stringify(first)).toBe(before);

    const opened = open(first, "mug");
    expect(opened.phase.kind).toBe("playing");
    expect(currentName(opened)).toBe(orderNames(first)[1]);
    expect(holder(opened, "mug")).toBe(orderNames(first)[0]);
    expect(stealsOf(opened, "mug")).toBe(0);
  });

  it("stops the victim from stealing the gift straight back", () => {
    let current = game(["Ada", "Bea", "Cal"], { stealLimit: 3, finalSwap: false }, 2);
    current = open(current, "mug");
    current = steal(current, "mug");
    expect(current.phase.kind).toBe("playing");
    expect(currentName(current)).toBe(orderNames(current)[0]);
    expect(holder(current, "mug")).toBe(orderNames(current)[1]);
    expect(stealsOf(current, "mug")).toBe(1);
    const gift = current.gifts.find((item) => item.label === "mug");
    expect(gift).toBeTruthy();
    if (!gift) return;
    expect(current.phase.kind === "playing" && current.phase.bannedGiftId).toBe(gift.id);

    const before = JSON.stringify(current);
    const blocked = act(current, { kind: "steal", giftId: gift.id });
    expect(blocked.ok).toBe(false);
    expect(JSON.stringify(current)).toBe(before);

    current = open(current, "book");
    expect(currentName(current)).toBe(orderNames(current)[2]);
    current = steal(current, "mug");
    expect(holder(current, "mug")).toBe(orderNames(current)[2]);
    expect(stealsOf(current, "mug")).toBe(2);
  });

  it("locks a gift after the steal limit", () => {
    let current = game(people, { stealLimit: 2, finalSwap: false }, 3);
    current = open(current, "mug");
    current = steal(current, "mug");
    expect(stealsOf(current, "mug")).toBe(1);
    current = open(current, "book");
    current = steal(current, "mug");
    expect(stealsOf(current, "mug")).toBe(2);
    current = open(current, "hat");

    const mug = current.gifts.find((item) => item.label === "mug");
    if (!mug || current.phase.kind !== "playing") throw new Error("expected an open mug");
    expect(current.phase.bannedGiftId).toBeNull();
    expect(mug.holderId).not.toBe(current.phase.currentId);
    const before = JSON.stringify(current);
    const blocked = act(current, { kind: "steal", giftId: mug.id });
    expect(blocked.ok).toBe(false);
    expect(JSON.stringify(current)).toBe(before);

    const thief = currentName(current);
    current = steal(current, "book");
    expect(holder(current, "book")).toBe(thief);
    expect(stealsOf(current, "book")).toBe(1);
  });

  it("follows a chain of steals back to the next opener", () => {
    let current = game(["Ada", "Bea", "Cal"], { stealLimit: 3, finalSwap: false }, 5);
    const names = orderNames(current);
    current = open(current, "mug");
    current = open(current, "book");
    current = steal(current, "mug");
    expect(currentName(current)).toBe(names[0]);
    expect(current.phase.kind === "playing" && current.phase.bannedGiftId).toBe(
      current.gifts.find((item) => item.label === "mug")?.id,
    );

    current = steal(current, "book");
    expect(currentName(current)).toBe(names[1]);
    expect(current.phase.kind === "playing" && current.phase.bannedGiftId).toBe(
      current.gifts.find((item) => item.label === "book")?.id,
    );

    current = open(current, "hat");
    expect(current.phase.kind).toBe("done");
    expect(holder(current, "mug")).toBe(names[2]);
    expect(holder(current, "book")).toBe(names[0]);
    expect(holder(current, "hat")).toBe(names[1]);
    expect(stealsOf(current, "mug")).toBe(1);
    expect(stealsOf(current, "book")).toBe(1);
    expect(stealsOf(current, "hat")).toBe(0);
  });

  it("returns to the next numbered player after a steal is answered with a new gift", () => {
    let current = game(["Ada", "Bea", "Cal"], { stealLimit: 3, finalSwap: false }, 6);
    const names = orderNames(current);
    current = open(current, "mug");
    current = steal(current, "mug");
    current = open(current, "book");
    expect(currentName(current)).toBe(names[2]);
  });

  it("gives player 1 a final swap when the rule is on", () => {
    let current = game(["Ada", "Bea", "Cal"], { stealLimit: 3, finalSwap: true }, 7);
    const names = orderNames(current);
    current = open(current, "mug");
    current = open(current, "book");
    current = open(current, "hat");
    expect(current.phase.kind).toBe("finalSwap");
    expect(currentName(current)).toBe(names[0]);

    const kept = played(act(current, { kind: "keep" }));
    expect(kept.phase.kind).toBe("done");
    expect(holder(kept, "mug")).toBe(holder(current, "mug"));
    expect(holder(kept, "book")).toBe(holder(current, "book"));
    expect(holder(kept, "hat")).toBe(holder(current, "hat"));

    let swapping = game(["Ada", "Bea", "Cal"], { stealLimit: 3, finalSwap: true }, 7);
    swapping = open(swapping, "mug");
    swapping = open(swapping, "book");
    swapping = open(swapping, "hat");
    const firstGift = swapping.gifts.find((item) => item.holderId === swapping.players.find((player) => player.order === 1)?.id);
    const secondGift = swapping.gifts.find((item) => item.holderId === swapping.players.find((player) => player.order === 2)?.id);
    expect(firstGift && secondGift).toBeTruthy();
    if (!firstGift || !secondGift) return;
    swapping = played(act(swapping, { kind: "steal", giftId: secondGift.id }));
    expect(swapping.phase.kind).toBe("done");
    expect(holder(swapping, secondGift.label)).toBe(names[0]);
    expect(holder(swapping, firstGift.label)).toBe(names[1]);
    expect(stealsOf(swapping, secondGift.label)).toBe(1);
    expect(stealsOf(swapping, firstGift.label)).toBe(0);
  });

  it("ends when the last gift is opened and the final swap is off", () => {
    let current = game(["Ada", "Bea", "Cal"], { stealLimit: 3, finalSwap: false }, 8);
    current = open(current, "mug");
    current = open(current, "book");
    expect(current.phase.kind).toBe("playing");
    current = open(current, "hat");
    expect(current.phase.kind).toBe("done");
    expect(current.gifts).toHaveLength(current.players.length);
  });

  it("refuses a locked gift on the final swap", () => {
    let current = game(["Ada", "Bea", "Cal"], { stealLimit: 1, finalSwap: true }, 9);
    current = open(current, "mug");
    current = steal(current, "mug");
    expect(stealsOf(current, "mug")).toBe(1);
    current = open(current, "book");
    current = open(current, "hat");
    expect(current.phase.kind).toBe("finalSwap");

    const mug = current.gifts.find((item) => item.label === "mug");
    if (!mug || current.phase.kind !== "finalSwap") throw new Error("expected a locked mug");
    expect(mug.holderId).not.toBe(current.phase.currentId);
    const before = JSON.stringify(current);
    const blocked = act(current, { kind: "steal", giftId: mug.id });
    expect(blocked.ok).toBe(false);
    expect(JSON.stringify(current)).toBe(before);
    expect(current.phase.kind).toBe("finalSwap");
  });

  it("round-trips a game and rejects a bad save", () => {
    const opened = open(game(people, { stealLimit: 3, finalSwap: true }, 10), "mug");
    expect(parseElephant(JSON.parse(JSON.stringify(opened)))).toEqual(opened);

    let banned = game(["Ada", "Bea", "Cal"], { stealLimit: 3, finalSwap: false }, 12);
    banned = open(banned, "mug");
    banned = steal(banned, "mug");
    expect(banned.phase.kind).toBe("playing");
    expect(parseElephant(JSON.parse(JSON.stringify(banned)))).toEqual(banned);

    let finalSwap = game(["Ada", "Bea", "Cal"], { stealLimit: 3, finalSwap: true }, 11);
    finalSwap = open(finalSwap, "mug");
    finalSwap = open(finalSwap, "book");
    finalSwap = open(finalSwap, "hat");
    expect(finalSwap.phase.kind).toBe("finalSwap");
    expect(parseElephant(JSON.parse(JSON.stringify(finalSwap)))).toEqual(finalSwap);

    const done = played(act(finalSwap, { kind: "keep" }));
    expect(done.phase.kind).toBe("done");
    expect(parseElephant(JSON.parse(JSON.stringify(done)))).toEqual(done);
    expect(parseElephant({ ok: true })).toBeNull();
  });
});
