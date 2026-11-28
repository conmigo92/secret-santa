import { describe, expect, it } from "vitest";
import { act, parseSweater, results, startSweater, type SweaterGame } from "../src/domain/sweater";

function started(names = ["Ada", "Bea", "Cal"]): SweaterGame {
  const result = startSweater(names);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("start failed");
  return result.game;
}

function others(game: SweaterGame, voterIndex: number): string[] {
  const voter = game.contestants[voterIndex]?.id;
  return game.contestants.map((person) => person.id).filter((id) => id !== voter);
}

function ballot(game: SweaterGame, voterIndex: number): SweaterGame {
  const ready = act(game, { kind: "ready" });
  if (!ready.ok) throw new Error("ready");
  const ids = others(ready.game, voterIndex);
  const voted = act(ready.game, {
    kind: "vote",
    picks: { ugliest: ids[0]!, creative: ids[1] ?? ids[0]!, festive: ids[0]! },
  });
  if (!voted.ok) throw new Error(voted.reason);
  return voted.game;
}

describe("ugly sweater", () => {
  it("hides the result until every person has voted and the host reveals", () => {
    let game = started();
    expect(results(game)).toBeNull();
    expect(act(game, { kind: "vote", picks: { ugliest: "x", creative: "y", festive: "z" } })).toEqual({
      ok: false,
      reason: "Hand over the phone first.",
    });
    game = ballot(game, 0);
    expect(game.phase).toEqual({ kind: "cover", voterIndex: 1 });
    expect(results(game)).toBeNull();
    game = ballot(game, 1);
    game = ballot(game, 2);
    expect(game.phase).toEqual({ kind: "sealed" });
    expect(results(game)).toBeNull();
    const shown = act(game, { kind: "reveal" });
    expect(shown.ok).toBe(true);
    if (!shown.ok) return;
    const board = results(shown.game);
    expect(board).not.toBeNull();
    expect(board?.map((row) => row.title)).toEqual(["Ugliest", "Most creative", "Most festive"]);
    expect(board?.every((row) => row.names.length > 0)).toBe(true);
  });

  it("rejects a vote for yourself", () => {
    const game = started(["Ada", "Bea"]);
    const ready = act(game, { kind: "ready" });
    if (!ready.ok || ready.game.phase.kind !== "ballot") throw new Error("ready");
    const self = ready.game.contestants[0]!.id;
    const other = ready.game.contestants[1]!.id;
    expect(
      act(ready.game, { kind: "vote", picks: { ugliest: self, creative: other, festive: other } }),
    ).toEqual({ ok: false, reason: "You can't vote for yourself." });
    expect(ready.game.ballots).toHaveLength(0);
  });

  it("names everyone who ties", () => {
    const game = started(["Ada", "Bea", "Cal"]);
    const [ada, bea, cal] = game.contestants;
    if (!ada || !bea || !cal) throw new Error("people");
    const filled: SweaterGame = {
      ...game,
      ballots: [
        { voterId: ada.id, picks: { ugliest: bea.id, creative: cal.id, festive: bea.id } },
        { voterId: bea.id, picks: { ugliest: ada.id, creative: cal.id, festive: cal.id } },
        { voterId: cal.id, picks: { ugliest: ada.id, creative: bea.id, festive: ada.id } },
      ],
      phase: { kind: "reveal" },
    };
    const board = results(filled);
    expect(board?.find((row) => row.category === "ugliest")?.names).toEqual(["Ada"]);
    expect(board?.find((row) => row.category === "creative")?.names).toEqual(["Cal"]);
    expect(board?.find((row) => row.category === "festive")?.names).toEqual(["Ada", "Bea", "Cal"]);
  });

  it("reads back a saved contest and rejects a self vote in storage", () => {
    const game = ballot(started(), 0);
    expect(parseSweater(JSON.parse(JSON.stringify(game)))).toEqual(game);
    const bad = JSON.parse(JSON.stringify(game)) as { ballots: { picks: { ugliest: string }; voterId: string }[] };
    bad.ballots[0]!.picks.ugliest = bad.ballots[0]!.voterId;
    expect(parseSweater(bad)).toBeNull();
  });

  it("needs two contestants", () => {
    expect(startSweater(["Ada"])).toEqual({ ok: false, reason: "Add at least two contestants." });
    expect(startSweater(["Ada", "ada"])).toEqual({ ok: false, reason: "That name is already on the list." });
  });
});
