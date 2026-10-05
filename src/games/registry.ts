import { riddle } from "./riddle/Riddle";
import type { GameDefinition } from "./types";

/**
 * One entry per puzzles.type. To add a game: write the component (with its
 * isData check), add it here, and document its JSON in docs/puzzle-formats.md.
 */
export const GAMES: Record<string, GameDefinition<unknown>> = {
  riddle,
};
