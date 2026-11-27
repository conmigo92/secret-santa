import type { Participant } from "./types";

const MAX_NAME_LENGTH = 40;

export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export function addParticipant(
  participants: readonly Participant[],
  name: string,
): { participants: Participant[] } | { error: string } {
  const normalized = normalizeName(name);
  if (!normalized) return { error: "Enter a name." };
  if ([...normalized].length > MAX_NAME_LENGTH) {
    return { error: "Use a shorter name (40 characters or fewer)." };
  }
  const duplicate = participants.some(
    (person) => person.name.localeCompare(normalized, undefined, { sensitivity: "accent" }) === 0,
  );
  if (duplicate) return { error: "That name is already on the list." };
  return {
    participants: [...participants, { id: crypto.randomUUID(), name: normalized }],
  };
}
