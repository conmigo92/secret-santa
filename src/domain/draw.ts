import type { Assignment, DrawResult, Exclusion, Participant, Rng } from "./types";

const defaultRng: Rng = () => Math.random();

/**
 * A complete search for a permutation where nobody is given themselves
 * and no excluded pair is matched in either direction.
 * Failure means no such draw exists.
 */
export function drawAssignments(
  participants: readonly Participant[],
  exclusions: readonly Exclusion[],
  rng: Rng = defaultRng,
): DrawResult {
  if (participants.length < 2) {
    return { ok: false, reason: "Add at least two people to draw." };
  }

  const ids = participants.map((person) => person.id);
  if (new Set(ids).size !== ids.length) {
    return { ok: false, reason: "Each person needs a unique id." };
  }

  const names = new Map(participants.map((person) => [person.id, person.name]));
  const idSet = new Set(ids);

  for (const exclusion of exclusions) {
    if (exclusion.a === exclusion.b) {
      return { ok: false, reason: "An exclusion has to be two different people." };
    }
    if (!idSet.has(exclusion.a) || !idSet.has(exclusion.b)) {
      return { ok: false, reason: "An exclusion names someone who isn't in the draw." };
    }
  }

  const forbidden = new Set<string>();
  for (const exclusion of exclusions) {
    forbidden.add(`${exclusion.a}\0${exclusion.b}`);
    forbidden.add(`${exclusion.b}\0${exclusion.a}`);
  }

  const options = new Map<string, string[]>();
  for (const giver of ids) {
    const receivers = ids.filter(
      (receiver) => receiver !== giver && !forbidden.has(`${giver}\0${receiver}`),
    );
    if (receivers.length === 0) {
      const name = names.get(giver) ?? "Someone";
      return {
        ok: false,
        reason: `${name} has nobody they can give a gift to. Remove an exclusion or add another person.`,
      };
    }
    options.set(giver, shuffle(receivers, rng));
  }

  const visitOrder = shuffle(ids, rng);
  const assignment = new Map<string, string>();
  const used = new Set<string>();

  if (!search()) {
    return {
      ok: false,
      reason: "No valid draw exists for this group. Remove an exclusion and try again.",
    };
  }

  const assignments: Assignment[] = [];
  for (const giverId of ids) {
    const receiverId = assignment.get(giverId);
    if (!receiverId) {
      return {
        ok: false,
        reason: "No valid draw exists for this group. Remove an exclusion and try again.",
      };
    }
    assignments.push({ giverId, receiverId });
  }

  return { ok: true, assignments };

  function search(): boolean {
    if (assignment.size === ids.length) return true;

    let giver = "";
    let choices: string[] = [];
    for (const candidate of visitOrder) {
      if (assignment.has(candidate)) continue;
      const open = options.get(candidate)!.filter((receiver) => !used.has(receiver));
      if (open.length === 0) return false;
      if (choices.length === 0 || open.length < choices.length) {
        giver = candidate;
        choices = open;
      }
    }

    for (const receiver of choices) {
      assignment.set(giver, receiver);
      used.add(receiver);
      if (search()) return true;
      assignment.delete(giver);
      used.delete(receiver);
    }
    return false;
  }
}

function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const unit = Math.min(0.999999, Math.max(0, rng()));
    const j = Math.floor(unit * (i + 1));
    const current = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = current;
  }
  return copy;
}
