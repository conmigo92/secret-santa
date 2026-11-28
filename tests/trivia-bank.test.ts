import { describe, expect, it } from "vitest";
import { TRIVIA_BANK, type TriviaQuestion } from "../src/domain/trivia-bank";

describe("trivia bank", () => {
  it("holds 120 or more original questions across the four topics", () => {
    expect(TRIVIA_BANK.length).toBeGreaterThanOrEqual(120);
    expect(count("movie")).toBeGreaterThanOrEqual(24);
    expect(count("song")).toBeGreaterThanOrEqual(24);
    expect(count("lyric")).toBeGreaterThanOrEqual(24);
    expect(count("tradition")).toBeGreaterThanOrEqual(28);
  });

  it("gives every question one id, four different choices, and a real answer", () => {
    const ids = new Set<string>();
    const prompts = new Set<string>();
    const answers = new Set<number>();
    for (const question of TRIVIA_BANK) {
      expect(ids.has(question.id)).toBe(false);
      expect(prompts.has(question.prompt)).toBe(false);
      ids.add(question.id);
      prompts.add(question.prompt);
      expect(question.prompt.length).toBeGreaterThan(0);
      expect(question.prompt.length).toBeLessThanOrEqual(180);
      expect(question.prompt.includes("\n")).toBe(false);
      expect(quotedWordCount(question.prompt)).toBeLessThanOrEqual(8);
      const choices = new Set(question.choices.map((choice) => choice.toLocaleLowerCase()));
      expect(question.choices).toHaveLength(4);
      expect(choices.size).toBe(4);
      for (const choice of question.choices) {
        expect(choice.length).toBeGreaterThan(0);
        expect(choice.length).toBeLessThanOrEqual(80);
        expect(quotedWordCount(choice)).toBeLessThanOrEqual(8);
      }
      expect(question.answer).toBeGreaterThanOrEqual(0);
      expect(question.answer).toBeLessThanOrEqual(3);
      answers.add(question.answer);
    }
    expect(answers).toEqual(new Set([0, 1, 2, 3]));
  });

  it("keeps a sample of answers on the known fact", () => {
    expect(fact("In Home Alone, Harry and Marv are known as what?")).toBe("The Wet Bandits");
    expect(fact("Who directed The Nightmare Before Christmas?")).toBe("Henry Selick");
    expect(fact("On which night was Silent Night first performed?")).toBe("Christmas Eve, 1818");
    expect(fact("Who composed the melody of Silent Night?")).toBe("Franz Xaver Gruber");
    expect(fact("Under what title was Jingle Bells first published in the 1850s?")).toBe(
      "The One Horse Open Sleigh",
    );
    expect(fact("Which 1942 film introduced the song White Christmas?")).toBe("Holiday Inn");
    expect(fact("Who wrote the song Rudolph the Red-Nosed Reindeer?")).toBe("Johnny Marks");
    expect(fact("Who sings the famous recording of Rockin' Around the Christmas Tree?")).toBe("Brenda Lee");
    expect(fact("Finish the carol title: O Little Town of ____.")).toBe("Bethlehem");
    expect(fact("How many Yule Lads visit children in Iceland, one on each night before Christmas?")).toBe(
      "13",
    );
    expect(fact("Churches that still use the Julian calendar celebrate Christmas on which civil date?")).toBe(
      "January 7",
    );
    expect(fact("The red parts of a poinsettia are which plant part?")).toBe("Bracts");
    expect(fact("NORAD's Santa tracking began in 1955 after a store ad in which state printed a wrong phone number?")).toBe(
      "Colorado",
    );
    expect(fact("The Christmas pickle ornament is best described as which of these?")).toBe(
      "A modern American shop custom",
    );
    expect(fact("Charles Dickens published A Christmas Carol in which year?")).toBe("1843");
    expect(fact("The Feast of the Seven Fishes is a Christmas Eve dinner from which community?")).toBe(
      "Italian-American families",
    );
  });
});

function count(topic: TriviaQuestion["topic"]): number {
  return TRIVIA_BANK.filter((question) => question.topic === topic).length;
}

function fact(prompt: string): string {
  const found = TRIVIA_BANK.filter((question) => question.prompt === prompt);
  expect(found).toHaveLength(1);
  const question = found[0];
  if (!question) throw new Error(prompt);
  return question.choices[question.answer];
}

function quotedWordCount(value: string): number {
  const quotes = value.match(/"([^"]*)"/g) ?? [];
  let most = 0;
  for (const quote of quotes) {
    const words = quote.slice(1, -1).trim().split(/\s+/).filter(Boolean);
    most = Math.max(most, words.length);
  }
  return most;
}
