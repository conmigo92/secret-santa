import { describe, expect, it } from "vitest";
import {
  BINGO_CENTER,
  BINGO_FREE,
  BINGO_MOMENTS,
  bingoLines,
  cardFromSeed,
  cardUrl,
  decodeCard,
  encodeCard,
  freshMarks,
  hasBingo,
  toggleMark,
} from "../src/domain/bingo";

describe("holiday bingo", () => {
  it("builds a 5 by 5 card with a free center from the party list", () => {
    expect(BINGO_MOMENTS.length).toBeGreaterThanOrEqual(24);
    expect(new Set(BINGO_MOMENTS).size).toBe(BINGO_MOMENTS.length);
    const card = cardFromSeed("a1b2c3d4e5f60718");
    expect(card?.squares).toHaveLength(25);
    expect(card?.squares[BINGO_CENTER]).toBe(BINGO_FREE);
    const moments = card?.squares.filter((square) => square !== BINGO_FREE) ?? [];
    expect(new Set(moments).size).toBe(24);
    expect(moments.every((square) => (BINGO_MOMENTS as readonly string[]).includes(square))).toBe(true);
    expect(cardFromSeed("a1b2c3d4e5f60718")).toEqual(card);
    expect(cardFromSeed("a1b2c3d4e5f60719")?.squares).not.toEqual(card?.squares);
  });

  it("spots a bingo line and ignores a card that is not a line", () => {
    const marked = freshMarks();
    expect(hasBingo(marked)).toBe(false);
    for (let index = 0; index < 5; index += 1) marked[index] = true;
    expect(bingoLines(marked)).toEqual([[0, 1, 2, 3, 4]]);
    expect(hasBingo(marked)).toBe(true);
    const toggled = toggleMark(marked, 0);
    expect(toggled?.[0]).toBe(false);
    expect(toggleMark(freshMarks(), BINGO_CENTER)).toBeNull();
  });

  it("puts the seed in a bingo page fragment", () => {
    const seed = "abc123def456";
    const token = encodeCard(seed);
    expect(token).toBeTruthy();
    if (!token) return;
    expect(decodeCard(token)).toBe(seed);
    expect(decodeCard("nope")).toBeNull();
    expect(cardUrl(token, "https://conmigo92.github.io", "/secret-santa/")).toBe(
      `https://conmigo92.github.io/secret-santa/bingo/#${token}`,
    );
  });
});
