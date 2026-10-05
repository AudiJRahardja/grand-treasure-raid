import type { ComponentType } from "react";

/** Cosmetic submit state from the page. The database enforces the real rules. */
export type SubmitState = {
  /** A submission is in flight */
  pending: boolean;
  /** Seconds until the cooldown ends (0 = can submit) */
  cooldownLeft: number;
};

/** Every game component receives exactly this. */
export type GameProps<D> = {
  /** For keying saved in-progress state (see useSavedState) */
  puzzleId: number;
  /** The puzzle's `data` JSON, already checked by `isData` */
  data: D;
  /** Send the answer JSON; the page passes it to submit_answer */
  onSubmit: (answer: unknown) => void;
  submit: SubmitState;
};

export type GameDefinition<D> = {
  /** Runtime check that the puzzle's `data` has the documented shape */
  isData: (data: unknown) => data is D;
  Component: ComponentType<GameProps<D>>;
};

/** Erases the data type so definitions can live in one registry map. */
export function defineGame<D>(def: GameDefinition<D>): GameDefinition<unknown> {
  return def as unknown as GameDefinition<unknown>;
}
