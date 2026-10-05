/** Puzzle metadata players may read (the `data` column is never selected). */
export const PUZZLE_COLUMNS = "id, event_id, checkpoint_number, type, title, opens_at, points";

export type PuzzleMeta = {
  id: number;
  event_id: number;
  checkpoint_number: number;
  type: string;
  title: string;
  opens_at: string;
  points: number;
};

export type ProgressRow = {
  puzzle_id: number;
  opened_at: string;
  solved_at: string | null;
  solve_seconds: number | null;
};

export type ScheduleRow = { checkpoint_number: number; opens_at: string };

/** Returned by the start_puzzle RPC. */
export type StartedPuzzle = {
  puzzle_id: number;
  type: string;
  title: string;
  data: unknown;
  opened_at: string;
};

/** Returned by the submit_answer RPC. */
export type SubmitResult =
  | { ok: true; correct: true; solve_seconds: number }
  | { ok: true; correct: false; retry_in_seconds: number }
  | { ok: false; reason: "cooldown"; retry_in_seconds: number }
  | { ok: true; already_solved: true };

/**
 * Mirrors v_cooldown in submit_answer(). Only used to show a countdown;
 * the database enforces the real cooldown.
 */
export const COOLDOWN_SECONDS = 60;
