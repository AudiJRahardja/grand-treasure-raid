// Types for logic.mjs (shared crossmath rules).

export type Op = "+" | "-" | "*" | "/";
export type Token = null | number | "_" | Op | "=";
export type CrossmathData = { cells: Token[][]; pool: number[] };
export type EqToken = { t: Exclude<Token, null>; blank?: number };
export type Equation = {
  dir: "row" | "col";
  cells: [number, number][];
  tokens: EqToken[];
  /** Indexes (into the blanks list) of this equation's blanks */
  blanks: number[];
};
/** Blank values in reading order; null = not filled yet */
export type BlankValues = (number | null)[];

export const MAX_SIZE: number;
export function parseCrossmath(cells: Token[][]): {
  blanks: [number, number][];
  equations: Equation[];
  covered: Set<string>;
};
export function validateCrossmath(data: unknown): string | null;
export function evaluate(values: number[], ops: Op[]): number | null;
export function evaluateLeft(tokens: EqToken[], blankValues: BlankValues): number | null;
export function equationHolds(tokens: EqToken[], blankValues: BlankValues): boolean;
export function solveCrossmath(
  data: CrossmathData,
  limit?: number,
): { solutions: number[][]; error?: string };
