import { describe, expect, it } from "vitest";
import { AWARD_BANK } from "../src/domain/awards-bank";
import { act, parseAwards, startAwards, titles, type AwardsGame } from "../src/domain/awards";
import { mulberry32 } from "./rng";

function started(names = ["Ada", "Bea"], count = 2, seed = 1): AwardsGame {
  const result = startAwards(names, count, mulberry32(seed));
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("start failed");
  return result.game;
}

function cast(game: AwardsGame, choiceId: string): AwardsGame {
  const ready = act(game, { kind: "ready" });
  if (!ready.ok) throw new Error("ready");
  const voted = act(ready.game, { kind: "vote", choiceId });
  if (!voted.ok) throw new Error(voted.reason);
  return voted.game;
}

describe("most likely to", () => {
  it("keeps a bank of prompts and hides titles until the last vote", () => {
    expect(AWARD_BANK.length).toBeGreaterThanOrEqual(16);
    expect(new Set(AWARD_BANK.map((prompt) => prompt.id)).size).toBe(AWARD_BANK.length);
    let game = started();
    expect(titles(game)).toBeNull();
    expect(act(game, { kind: "vote", choiceId: game.people[0]!.id })).toEqual({
      ok: false,
      reason: "Hand over the phone first.",
    });
    game = cast(game, game.people[1]!.id);
    expect(game.phase).toEqual({ kind: "cover", promptIndex: 0, voterIndex: 1 });
    expect(titles(game)).toBeNull();
  });

  it("gives the title to the person with the most votes, including a tie", () => {
    const game = started(["Ada", "Bea", "Cal"], 1, 4);
    const [ada, bea, cal] = game.people;
    if (!ada || !bea || !cal) throw new Error("people");
    let round = cast(game, bea.id);
    round = cast(round, ada.id);
    round = cast(round, bea.id);
    expect(round.phase).toEqual({ kind: "results" });
    const board = titles(round);
    expect(board?.find((row) => row.name === "Bea")?.titles).toHaveLength(1);
    expect(board?.find((row) => row.name === "Ada")?.titles).toEqual([]);
    const tied: AwardsGame = {
      ...round,
      votes: [
        { promptId: round.prompts[0]!, voterId: ada.id, choiceId: bea.id },
        { promptId: round.prompts[0]!, voterId: bea.id, choiceId: ada.id },
        { promptId: round.prompts[0]!, voterId: cal.id, choiceId: cal.id },
      ],
    };
    const names = titles(tied)?.filter((row) => row.titles.length > 0).map((row) => row.name);
    expect(names).toEqual(["Ada", "Bea", "Cal"]);
  });

  it("reads a saved game and needs two people", () => {
    const game = started();
    const voted = cast(game, game.people[0]!.id);
    expect(parseAwards(JSON.parse(JSON.stringify(voted)))).toEqual(voted);
    expect(startAwards(["Ada"], 4, mulberry32(1))).toEqual({ ok: false, reason: "Add at least two people." });
    expect(voted.votes).toHaveLength(1);
  });
});
