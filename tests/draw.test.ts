import { describe, expect, it } from "vitest";
import { drawAssignments } from "../src/domain/draw";
import type { DrawResult, Exclusion, Participant } from "../src/domain/types";
import { mulberry32 } from "./rng";

function people(count: number): Participant[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index}`,
    name: `Person ${index}`,
  }));
}

function assertValid(
  result: DrawResult,
  participants: readonly Participant[],
  exclusions: readonly Exclusion[],
): void {
  expect(result.ok).toBe(true);
  if (!result.ok) return;

  const ids = participants.map((person) => person.id);
  const forbidden = new Set<string>();
  for (const exclusion of exclusions) {
    forbidden.add(`${exclusion.a}->${exclusion.b}`);
    forbidden.add(`${exclusion.b}->${exclusion.a}`);
  }

  expect(result.assignments).toHaveLength(ids.length);
  expect(new Set(result.assignments.map((assignment) => assignment.giverId))).toEqual(new Set(ids));
  expect(new Set(result.assignments.map((assignment) => assignment.receiverId))).toEqual(new Set(ids));

  for (const assignment of result.assignments) {
    expect(assignment.giverId).not.toBe(assignment.receiverId);
    expect(forbidden.has(`${assignment.giverId}->${assignment.receiverId}`)).toBe(false);
  }
}

/** Bipartite matching, independent of the draw search. */
function hasPerfectMatching(ids: readonly string[], exclusions: readonly Exclusion[]): boolean {
  const forbidden = new Set<string>();
  for (const exclusion of exclusions) {
    forbidden.add(`${exclusion.a}->${exclusion.b}`);
    forbidden.add(`${exclusion.b}->${exclusion.a}`);
  }
  const options = new Map<string, string[]>();
  for (const giver of ids) {
    options.set(
      giver,
      ids.filter((receiver) => receiver !== giver && !forbidden.has(`${giver}->${receiver}`)),
    );
  }

  const matchedGiver = new Map<string, string>();

  function visit(giver: string, seen: Set<string>): boolean {
    for (const receiver of options.get(giver) ?? []) {
      if (seen.has(receiver)) continue;
      seen.add(receiver);
      const owner = matchedGiver.get(receiver);
      if (!owner || visit(owner, seen)) {
        matchedGiver.set(receiver, giver);
        return true;
      }
    }
    return false;
  }

  return ids.every((giver) => visit(giver, new Set()));
}

describe("drawAssignments", () => {
  it("draws a derangement when nobody is excluded", () => {
    const group = people(5);
    const result = drawAssignments(group, [], mulberry32(4));
    assertValid(result, group, []);
  });

  it("never gives a random group themselves or an excluded partner", () => {
    for (let seed = 0; seed < 80; seed++) {
      const rng = mulberry32(seed);
      const count = 2 + Math.floor(rng() * 8);
      const group = people(count);
      const exclusions: Exclusion[] = [];
      const ids = group.map((person) => person.id);
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          if (rng() < 0.28) exclusions.push({ a: ids[i]!, b: ids[j]! });
        }
      }

      const result = drawAssignments(group, exclusions, rng);
      const feasible = hasPerfectMatching(ids, exclusions);
      if (feasible) assertValid(result, group, exclusions);
      else expect(result.ok).toBe(false);
    }
  });

  it("keeps a couple from drawing each other in either direction", () => {
    const group = people(5);
    const exclusions: Exclusion[] = [{ a: "p0", b: "p1" }];
    for (let seed = 0; seed < 40; seed++) {
      const result = drawAssignments(group, exclusions, mulberry32(seed + 100));
      assertValid(result, group, exclusions);
    }
  });

  it("is stable for the same random source", () => {
    const group = people(6);
    const first = drawAssignments(group, [{ a: "p2", b: "p3" }], mulberry32(9));
    const second = drawAssignments(group, [{ a: "p2", b: "p3" }], mulberry32(9));
    expect(first).toEqual(second);
  });

  it("reports a draw that cannot exist", () => {
    expect(drawAssignments(people(1), []).ok).toBe(false);
    expect(drawAssignments([], []).ok).toBe(false);

    const couple = drawAssignments(people(2), [{ a: "p0", b: "p1" }]);
    expect(couple.ok).toBe(false);
    if (!couple.ok) expect(couple.reason).toMatch(/nobody they can give/i);

    const isolated = drawAssignments(people(3), [
      { a: "p0", b: "p1" },
      { a: "p0", b: "p2" },
    ]);
    expect(isolated.ok).toBe(false);
    if (!isolated.ok) expect(isolated.reason).toContain("Person 0");

    // p0 and p2 can each give only to p1, so a full assignment is impossible
    // even though nobody is out of choices at the start.
    const squeezed = drawAssignments(people(3), [{ a: "p0", b: "p2" }]);
    expect(squeezed.ok).toBe(false);
    if (!squeezed.ok) expect(squeezed.reason).toMatch(/No valid draw/);

    const unknown = drawAssignments(people(3), [{ a: "p0", b: "missing" }]);
    expect(unknown.ok).toBe(false);
  });

  it("blocks an exclusion stored in only one direction", () => {
    const group = people(4);
    const result = drawAssignments(group, [{ a: "p3", b: "p0" }], mulberry32(2));
    assertValid(result, group, [{ a: "p0", b: "p3" }]);
  });
});
