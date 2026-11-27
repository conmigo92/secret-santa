export interface Participant {
  id: string;
  name: string;
}

/** Unordered pair. Neither person may draw the other. */
export interface Exclusion {
  a: string;
  b: string;
}

export interface Assignment {
  giverId: string;
  receiverId: string;
}

export type DrawResult =
  | { ok: true; assignments: Assignment[] }
  | { ok: false; reason: string };

/** One person's match. A link never carries anyone else's assignment. */
export interface LinkPayload {
  giverName: string;
  receiverName: string;
  budget?: string;
  exchangeDate?: string;
}

/** Returns a float in [0, 1). */
export type Rng = () => number;
