import type { Exclusion, Participant } from "./types";

export function samePair(exclusion: Exclusion, a: string, b: string): boolean {
  return (exclusion.a === a && exclusion.b === b) || (exclusion.a === b && exclusion.b === a);
}

export function addExclusion(
  participants: readonly Participant[],
  exclusions: readonly Exclusion[],
  a: string,
  b: string,
): { exclusions: Exclusion[] } | { error: string } {
  if (!a || !b || a === b) return { error: "Pick two different people." };
  const ids = new Set(participants.map((person) => person.id));
  if (!ids.has(a) || !ids.has(b)) {
    return { error: "Both people need to be on the list." };
  }
  if (exclusions.some((exclusion) => samePair(exclusion, a, b))) {
    return { error: "That pair is already excluded." };
  }
  return { exclusions: [...exclusions, { a, b }] };
}

export function removeExclusion(
  exclusions: readonly Exclusion[],
  a: string,
  b: string,
): Exclusion[] {
  return exclusions.filter((exclusion) => !samePair(exclusion, a, b));
}

export function removeParticipant(
  participants: readonly Participant[],
  exclusions: readonly Exclusion[],
  id: string,
): { participants: Participant[]; exclusions: Exclusion[] } {
  return {
    participants: participants.filter((person) => person.id !== id),
    exclusions: exclusions.filter((exclusion) => exclusion.a !== id && exclusion.b !== id),
  };
}
