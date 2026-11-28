import { normalizeName } from "./participants";

export const SWEATER_CATEGORIES = [
  { id: "ugliest", title: "Ugliest" },
  { id: "creative", title: "Most creative" },
  { id: "festive", title: "Most festive" },
] as const;

export type SweaterCategory = (typeof SWEATER_CATEGORIES)[number]["id"];

export interface Contestant {
  id: string;
  name: string;
}

export interface Ballot {
  voterId: string;
  picks: Record<SweaterCategory, string>;
}

export type SweaterPhase =
  | { kind: "cover"; voterIndex: number }
  | { kind: "ballot"; voterIndex: number }
  | { kind: "sealed" }
  | { kind: "reveal" };

export interface SweaterGame {
  contestants: Contestant[];
  ballots: Ballot[];
  phase: SweaterPhase;
}

export interface SweaterWin {
  category: SweaterCategory;
  title: string;
  names: string[];
}

export const SWEATER_SETTINGS = { min: 2, max: 16, nameMax: 40 } as const;

export type SweaterAction = { kind: "ready" } | { kind: "vote"; picks: Record<SweaterCategory, string> } | { kind: "reveal" };

export type SweaterResult = { ok: true; game: SweaterGame } | { ok: false; reason: string };

export function startSweater(names: readonly string[]): SweaterResult {
  if (names.length === 0) return { ok: false, reason: "Add at least two contestants." };
  const cleaned: string[] = [];
  for (const raw of names) {
    const name = normalizeName(raw);
    if (!name) return { ok: false, reason: "Enter a name." };
    if ([...name].length > SWEATER_SETTINGS.nameMax) {
      return { ok: false, reason: "Use a shorter name (40 characters or fewer)." };
    }
    if (cleaned.some((existing) => existing.localeCompare(name, undefined, { sensitivity: "accent" }) === 0)) {
      return { ok: false, reason: "That name is already on the list." };
    }
    cleaned.push(name);
  }
  if (cleaned.length < SWEATER_SETTINGS.min) return { ok: false, reason: "Add at least two contestants." };
  if (cleaned.length > SWEATER_SETTINGS.max) return { ok: false, reason: "Use 16 contestants or fewer." };
  return {
    ok: true,
    game: {
      contestants: cleaned.map((name) => ({ id: crypto.randomUUID(), name })),
      ballots: [],
      phase: { kind: "cover", voterIndex: 0 },
    },
  };
}

export function act(game: SweaterGame, action: SweaterAction): SweaterResult {
  switch (action.kind) {
    case "ready":
      return ready(game);
    case "vote":
      return vote(game, action.picks);
    case "reveal":
      return reveal(game);
  }
}

export function results(game: SweaterGame): SweaterWin[] | null {
  if (game.phase.kind !== "reveal") return null;
  return SWEATER_CATEGORIES.map((category) => {
    const counts = new Map<string, number>();
    for (const ballot of game.ballots) {
      const pick = ballot.picks[category.id];
      counts.set(pick, (counts.get(pick) ?? 0) + 1);
    }
    const top = Math.max(0, ...counts.values());
    const names = game.contestants
      .filter((person) => counts.get(person.id) === top)
      .map((person) => person.name);
    return { category: category.id, title: category.title, names };
  });
}

export function parseSweater(value: unknown): SweaterGame | null {
  if (!isRecord(value) || !exactKeys(value, ["contestants", "ballots", "phase"])) return null;
  const contestants = parseContestants(value.contestants);
  if (!contestants) return null;
  const ids = new Set(contestants.map((person) => person.id));
  const ballots = parseBallots(value.ballots, ids);
  const phase = parsePhase(value.phase, contestants.length, ballots?.length ?? -1);
  if (!ballots || !phase) return null;
  if (phase.kind === "cover" || phase.kind === "ballot") {
    if (ballots.length !== phase.voterIndex) return null;
  } else if (ballots.length !== contestants.length) {
    return null;
  }
  return { contestants, ballots, phase };
}

function ready(game: SweaterGame): SweaterResult {
  if (game.phase.kind === "sealed" || game.phase.kind === "reveal") {
    return { ok: false, reason: "Voting is closed." };
  }
  if (game.phase.kind === "ballot") return { ok: false, reason: "The ballot is already open." };
  return { ok: true, game: clone(game, { kind: "ballot", voterIndex: game.phase.voterIndex }) };
}

function vote(game: SweaterGame, picks: Record<SweaterCategory, string>): SweaterResult {
  if (game.phase.kind === "cover") return { ok: false, reason: "Hand over the phone first." };
  if (game.phase.kind !== "ballot") return { ok: false, reason: "Voting is closed." };
  const voter = game.contestants[game.phase.voterIndex];
  if (!voter) return { ok: false, reason: "That voter is not in this contest." };
  for (const category of SWEATER_CATEGORIES) {
    const pick = picks[category.id];
    if (!game.contestants.some((person) => person.id === pick)) {
      return { ok: false, reason: "Pick someone in every category." };
    }
    if (pick === voter.id) return { ok: false, reason: "You can't vote for yourself." };
  }
  const ballot: Ballot = {
    voterId: voter.id,
    picks: { ugliest: picks.ugliest, creative: picks.creative, festive: picks.festive },
  };
  const ballots = [...game.ballots, ballot];
  const next = game.phase.voterIndex + 1;
  const phase: SweaterPhase =
    next >= game.contestants.length ? { kind: "sealed" } : { kind: "cover", voterIndex: next };
  return { ok: true, game: clone({ ...game, ballots }, phase) };
}

function reveal(game: SweaterGame): SweaterResult {
  if (game.phase.kind === "reveal") return { ok: false, reason: "The winners are already up." };
  if (game.phase.kind !== "sealed") return { ok: false, reason: "Finish voting before the reveal." };
  return { ok: true, game: clone(game, { kind: "reveal" }) };
}

function clone(game: SweaterGame, phase: SweaterPhase): SweaterGame {
  return {
    contestants: game.contestants.map((person) => ({ ...person })),
    ballots: game.ballots.map((ballot) => ({ voterId: ballot.voterId, picks: { ...ballot.picks } })),
    phase,
  };
}

function parseContestants(value: unknown): Contestant[] | null {
  if (!Array.isArray(value) || value.length < SWEATER_SETTINGS.min || value.length > SWEATER_SETTINGS.max) return null;
  const people: Contestant[] = [];
  for (const item of value) {
    if (!isRecord(item) || !exactKeys(item, ["id", "name"])) return null;
    if (typeof item.id !== "string" || item.id.length === 0) return null;
    if (typeof item.name !== "string" || item.name !== normalizeName(item.name) || item.name.length === 0) return null;
    if ([...item.name].length > SWEATER_SETTINGS.nameMax) return null;
    people.push({ id: item.id, name: item.name });
  }
  if (new Set(people.map((person) => person.id)).size !== people.length) return null;
  return people;
}

function parseBallots(value: unknown, ids: Set<string>): Ballot[] | null {
  if (!Array.isArray(value)) return null;
  const ballots: Ballot[] = [];
  const voters = new Set<string>();
  for (const item of value) {
    if (!isRecord(item) || !exactKeys(item, ["voterId", "picks"])) return null;
    if (typeof item.voterId !== "string" || !ids.has(item.voterId) || voters.has(item.voterId)) return null;
    if (!isRecord(item.picks) || !exactKeys(item.picks, ["ugliest", "creative", "festive"])) return null;
    const picks = {} as Record<SweaterCategory, string>;
    for (const category of SWEATER_CATEGORIES) {
      const pick = item.picks[category.id];
      if (typeof pick !== "string" || !ids.has(pick) || pick === item.voterId) return null;
      picks[category.id] = pick;
    }
    voters.add(item.voterId);
    ballots.push({ voterId: item.voterId, picks });
  }
  return ballots;
}

function parsePhase(value: unknown, count: number, ballots: number): SweaterPhase | null {
  if (!isRecord(value) || typeof value.kind !== "string") return null;
  if (value.kind === "sealed" || value.kind === "reveal") {
    if (!exactKeys(value, ["kind"])) return null;
    return { kind: value.kind };
  }
  if ((value.kind !== "cover" && value.kind !== "ballot") || !exactKeys(value, ["kind", "voterIndex"])) return null;
  if (typeof value.voterIndex !== "number" || !Number.isInteger(value.voterIndex)) return null;
  if (value.voterIndex < 0 || value.voterIndex >= count || value.voterIndex !== ballots) return null;
  return { kind: value.kind, voterIndex: value.voterIndex };
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const present = Object.keys(value);
  if (present.length !== keys.length) return false;
  return keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
