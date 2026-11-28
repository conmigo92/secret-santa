import { describe, expect, it } from "vitest";
import { encodeLink } from "../src/domain/link";
import { rootHasRevealHash, secretSantaRevealUrl } from "../src/domain/root-route";
import { gameLinks } from "../src/ui/game-catalog";

describe("game list", () => {
  it("lists each game once, with a play path and a how-to path", () => {
    const games = gameLinks();
    expect(games.map((game) => game.label)).toEqual([
      "Secret Santa",
      "White Elephant",
      "Dirty Santa",
      "Christmas Trivia",
    ]);
    expect(games.map((game) => game.href)).toEqual([
      "secret-santa/",
      "white-elephant/",
      "dirty-santa/",
      "trivia/",
    ]);
    expect(games.map((game) => game.guide)).toEqual([
      "how-to/secret-santa/",
      "how-to/white-elephant/",
      "how-to/dirty-santa/",
      "how-to/trivia/",
    ]);
    expect(games.map((game) => game.order)).toEqual(games.map((_, index) => index));
    expect(games.every((game) => game.pitch.length > 0)).toBe(true);
  });
});

describe("old Secret Santa links", () => {
  it("keeps an empty fragment on the hub", () => {
    expect(rootHasRevealHash("")).toBe(false);
    expect(rootHasRevealHash("#")).toBe(false);
  });

  it("sends a root fragment to the Secret Santa reveal", () => {
    const token = encodeLink({ giverName: "Ada", receiverName: "Grace", budget: "$20" });
    const hash = `#${token}`;
    expect(rootHasRevealHash(hash)).toBe(true);
    expect(secretSantaRevealUrl("https://conmigo92.github.io", "/secret-santa/", hash)).toBe(
      `https://conmigo92.github.io/secret-santa/secret-santa/#${token}`,
    );
  });
});
