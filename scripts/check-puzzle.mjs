#!/usr/bin/env node
// Dev-only: check that a sudoku, queens or crossmath puzzle has exactly one solution
// before you insert it. The server compares answers by exact equality, so a
// puzzle with two solutions would mark a correct solve as wrong.
//
//   npm run check-puzzle -- path/to/puzzle.json
//
// The file holds the puzzle type, its `data` (exactly what goes into
// puzzles.data) and, optionally, the `solution` you plan to store:
//   { "type": "sudoku", "data": { "grid": [[...], ...] }, "solution": [[...], ...] }
//   { "type": "queens", "data": { "size": 6, "regions": [[...], ...] }, "solution": [1, 3, ...] }
//   { "type": "crossmath", "data": { "cells": [[...], ...], "pool": [...] }, "solution": [6, 3, ...] }
//
// Exit code 0 = valid and unique (and matches `solution` if given), 1 = problem.

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// ---------------------------------------------------------------- sudoku

/** Returns an error string, or null if data is a well-formed sudoku. */
export function validateSudoku(data) {
  const g = data?.grid;
  if (!Array.isArray(g) || g.length !== 9) return "data.grid must be an array of 9 rows";
  for (let r = 0; r < 9; r++) {
    if (!Array.isArray(g[r]) || g[r].length !== 9) return `row ${r} must have 9 numbers`;
    for (let c = 0; c < 9; c++) {
      const v = g[r][c];
      if (!Number.isInteger(v) || v < 0 || v > 9) return `cell [${r}][${c}] must be an integer 0-9 (got ${JSON.stringify(v)})`;
    }
  }
  return null;
}

/** Finds up to `limit` solutions with bitmask backtracking. */
export function solveSudoku(grid, limit = 2) {
  const g = grid.map((row) => [...row]);
  const rows = new Array(9).fill(0);
  const cols = new Array(9).fill(0);
  const boxes = new Array(9).fill(0);
  const box = (r, c) => Math.floor(r / 3) * 3 + Math.floor(c / 3);
  const empties = [];

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const v = g[r][c];
      if (v === 0) {
        empties.push([r, c]);
        continue;
      }
      const bit = 1 << v;
      if (rows[r] & bit || cols[c] & bit || boxes[box(r, c)] & bit) {
        return { solutions: [], error: `the givens repeat ${v} (at row ${r}, column ${c})` };
      }
      rows[r] |= bit;
      cols[c] |= bit;
      boxes[box(r, c)] |= bit;
    }
  }

  const solutions = [];
  const search = () => {
    if (solutions.length >= limit) return;
    // Most-constrained empty cell first
    let best = -1;
    let bestMask = 0;
    let bestCount = 10;
    for (let i = 0; i < empties.length; i++) {
      const [r, c] = empties[i];
      if (g[r][c] !== 0) continue;
      const mask = ~(rows[r] | cols[c] | boxes[box(r, c)]) & 0b1111111110;
      let count = 0;
      for (let m = mask; m; m &= m - 1) count++;
      if (count < bestCount) {
        best = i;
        bestMask = mask;
        bestCount = count;
        if (count <= 1) break;
      }
    }
    if (best === -1) {
      solutions.push(g.map((row) => [...row]));
      return;
    }
    const [r, c] = empties[best];
    for (let v = 1; v <= 9; v++) {
      const bit = 1 << v;
      if (!(bestMask & bit)) continue;
      g[r][c] = v;
      rows[r] |= bit;
      cols[c] |= bit;
      boxes[box(r, c)] |= bit;
      search();
      g[r][c] = 0;
      rows[r] &= ~bit;
      cols[c] &= ~bit;
      boxes[box(r, c)] &= ~bit;
      if (solutions.length >= limit) return;
    }
  };
  search();
  return { solutions };
}

// ---------------------------------------------------------------- queens

/** Returns an error string, or null if data is a well-formed queens puzzle. */
export function validateQueens(data) {
  const n = data?.size;
  const regions = data?.regions;
  if (!Number.isInteger(n) || n < 4 || n > 12) return "data.size must be an integer from 4 to 12";
  if (!Array.isArray(regions) || regions.length !== n) return `data.regions must have ${n} rows`;
  const seen = new Set();
  for (let r = 0; r < n; r++) {
    if (!Array.isArray(regions[r]) || regions[r].length !== n) return `regions row ${r} must have ${n} numbers`;
    for (let c = 0; c < n; c++) {
      const id = regions[r][c];
      if (!Number.isInteger(id) || id < 0 || id >= n) return `region id at [${r}][${c}] must be 0-${n - 1}`;
      seen.add(id);
    }
  }
  if (seen.size !== n) return `expected ${n} regions (ids 0-${n - 1}), found ${seen.size}`;
  return null;
}

/**
 * One queen per row, column and region; queens may not touch, even diagonally.
 * Solutions are arrays where item r is the (0-based) column of the queen in row r.
 */
export function solveQueens({ size: n, regions }, limit = 2) {
  const solutions = [];
  const cols = [];
  const usedCols = new Set();
  const usedRegions = new Set();

  const place = (r) => {
    if (solutions.length >= limit) return;
    if (r === n) {
      solutions.push([...cols]);
      return;
    }
    for (let c = 0; c < n; c++) {
      const region = regions[r][c];
      if (usedCols.has(c) || usedRegions.has(region)) continue;
      // Only the previous row can touch (one queen per row and column)
      if (r > 0 && Math.abs(cols[r - 1] - c) <= 1) continue;
      cols.push(c);
      usedCols.add(c);
      usedRegions.add(region);
      place(r + 1);
      cols.pop();
      usedCols.delete(c);
      usedRegions.delete(region);
    }
  };
  place(0);
  return { solutions };
}

// ---------------------------------------------------------------- crossmath
//
// data.cells is a grid of tokens:
//   null            gap (no cell)
//   integer         fixed number
//   "_"             blank the player fills
//   "+" "-" "*" "/" operator (shown as + − × ÷)
//   "="             equals
// Every horizontal or vertical run of 2+ adjacent cells is one equation:
//   operand (op operand)* = operand      (operand = integer or "_")
// Normal precedence (× ÷ before + −); division must be exact.
// Blanks take numbers from data.pool (each pool entry used exactly once), or,
// with no pool, any integer in data.range [min, max].

const OPS = new Set(["+", "-", "*", "/"]);
const isOperand = (t) => t === "_" || Number.isInteger(t);

/** Splits the grid into equations. Each token is { t, blank? } where blank is the blank's index. */
export function parseCrossmath(cells) {
  const blanks = []; // [row, col] in reading order
  const blankIndex = new Map();
  cells.forEach((row, r) =>
    row.forEach((t, c) => {
      if (t === "_") {
        blankIndex.set(`${r},${c}`, blanks.length);
        blanks.push([r, c]);
      }
    }),
  );

  const equations = [];
  const covered = new Set();
  const rows = cells.length;
  const cols = cells[0].length;
  const scan = (dir) => {
    const outer = dir === "row" ? rows : cols;
    const inner = dir === "row" ? cols : rows;
    for (let i = 0; i < outer; i++) {
      let run = [];
      const flush = () => {
        if (run.length >= 2) equations.push({ dir, cells: run });
        run = [];
      };
      for (let j = 0; j <= inner; j++) {
        const [r, c] = dir === "row" ? [i, j] : [j, i];
        const t = j < inner ? cells[r][c] : null;
        if (t === null) flush();
        else run.push([r, c]);
      }
    }
  };
  scan("row");
  scan("col");

  for (const eq of equations) {
    eq.tokens = eq.cells.map(([r, c]) => {
      covered.add(`${r},${c}`);
      const t = cells[r][c];
      return t === "_" ? { t, blank: blankIndex.get(`${r},${c}`) } : { t };
    });
  }
  return { blanks, equations, covered };
}

/** Returns an error string, or null if data is a well-formed crossmath. */
export function validateCrossmath(data) {
  const cells = data?.cells;
  if (!Array.isArray(cells) || cells.length < 1 || cells.length > 12) return "data.cells must have 1 to 12 rows";
  const width = cells[0]?.length;
  if (!Number.isInteger(width) || width < 3 || width > 12) return "each row must have 3 to 12 cells";
  for (let r = 0; r < cells.length; r++) {
    if (!Array.isArray(cells[r]) || cells[r].length !== width) return `row ${r} must have ${width} cells`;
    for (let c = 0; c < width; c++) {
      const t = cells[r][c];
      if (!(t === null || t === "=" || OPS.has(t) || isOperand(t))) {
        return `cell [${r}][${c}] must be null, an integer, "_", "+", "-", "*", "/" or "=" (got ${JSON.stringify(t)})`;
      }
    }
  }

  const { blanks, equations, covered } = parseCrossmath(cells);
  if (blanks.length === 0) return "there are no blanks (\"_\") to fill";
  for (const eq of equations) {
    const where = `${eq.dir} equation starting at [${eq.cells[0]}]`;
    const ts = eq.tokens.map((x) => x.t);
    const eqAt = ts.indexOf("=");
    if (eqAt === -1 || ts.lastIndexOf("=") !== eqAt) return `${where} needs exactly one "="`;
    if (eqAt !== ts.length - 2) return `${where}: "=" must be followed by exactly one number or blank`;
    for (let i = 0; i < eqAt; i++) {
      const wantOperand = i % 2 === 0;
      if (wantOperand ? !isOperand(ts[i]) : !OPS.has(ts[i])) {
        return `${where}: expected ${wantOperand ? "a number or blank" : "an operator"} at position ${i + 1}`;
      }
    }
    if (eqAt % 2 !== 1) return `${where}: the left side must end with a number or blank`;
    if (!isOperand(ts.at(-1))) return `${where}: must end with a number or blank`;
  }
  for (let r = 0; r < cells.length; r++) {
    for (let c = 0; c < width; c++) {
      if (cells[r][c] !== null && !covered.has(`${r},${c}`)) {
        return `cell [${r}][${c}] is not part of any equation`;
      }
    }
  }

  if (data.pool !== undefined) {
    if (!Array.isArray(data.pool) || !data.pool.every(Number.isInteger)) return "data.pool must be an array of integers";
    if (data.pool.length !== blanks.length) {
      return `data.pool has ${data.pool.length} numbers but there are ${blanks.length} blanks`;
    }
  } else {
    const range = data.range;
    if (!Array.isArray(range) || range.length !== 2 || !range.every(Number.isInteger) || range[0] > range[1]) {
      return "give either data.pool (numbers to place) or data.range [min, max]";
    }
    if (range[1] - range[0] > 999) return "data.range is too wide (max 1000 values)";
  }
  return null;
}

/** Value of `a op b op c ...` with × ÷ before + −, or null if a division isn't exact. */
export function evaluate(values, ops) {
  const terms = [values[0]];
  const signs = [1];
  for (let i = 0; i < ops.length; i++) {
    const v = values[i + 1];
    if (ops[i] === "*") terms[terms.length - 1] *= v;
    else if (ops[i] === "/") {
      const last = terms[terms.length - 1];
      if (v === 0 || last % v !== 0) return null;
      terms[terms.length - 1] = last / v;
    } else {
      terms.push(v);
      signs.push(ops[i] === "+" ? 1 : -1);
    }
  }
  return terms.reduce((sum, t, i) => sum + signs[i] * t, 0);
}

/** True if an equation holds, given values for all blanks. */
export function equationHolds(tokens, blankValues) {
  const val = (x) => (x.t === "_" ? blankValues[x.blank] : x.t);
  const left = tokens.slice(0, -2);
  const values = left.filter((_, i) => i % 2 === 0).map(val);
  const ops = left.filter((_, i) => i % 2 === 1).map((x) => x.t);
  const result = evaluate(values, ops);
  return result !== null && result === val(tokens.at(-1));
}

/** Finds up to `limit` solutions: arrays of blank values in reading order. */
export function solveCrossmath(data, limit = 2) {
  const { blanks, equations } = parseCrossmath(data.cells);
  const n = blanks.length;
  const eqBlanks = equations.map((eq) => [...new Set(eq.tokens.filter((x) => x.t === "_").map((x) => x.blank))]);

  // Fill blanks so equations complete as early as possible (prunes the search)
  const order = [];
  const placed = new Set();
  while (order.length < n) {
    let best = -1;
    let bestScore = Infinity;
    for (let b = 0; b < n; b++) {
      if (placed.has(b)) continue;
      const score = Math.min(
        ...eqBlanks.map((bs) => (bs.includes(b) ? bs.filter((x) => !placed.has(x)).length : Infinity)),
      );
      if (score < bestScore) [best, bestScore] = [b, score];
    }
    order.push(best);
    placed.add(best);
  }
  // Equations to check right after the k-th blank in `order` is placed
  const position = new Map(order.map((b, k) => [b, k]));
  const checkAt = Array.from({ length: n }, () => []);
  equations.forEach((eq, i) => {
    const last = Math.max(-1, ...eqBlanks[i].map((b) => position.get(b)));
    if (last >= 0) checkAt[last].push(eq);
  });
  // Equations without blanks must already hold
  if (equations.some((eq, i) => eqBlanks[i].length === 0 && !equationHolds(eq.tokens, []))) {
    return { solutions: [], error: "an equation with no blanks is false" };
  }

  const counts = new Map();
  if (data.pool) data.pool.forEach((v) => counts.set(v, (counts.get(v) ?? 0) + 1));
  const candidates = data.pool
    ? () => [...counts.keys()].filter((v) => counts.get(v) > 0)
    : () => Array.from({ length: data.range[1] - data.range[0] + 1 }, (_, i) => data.range[0] + i);

  const values = new Array(n).fill(null);
  const solutions = [];
  const search = (k) => {
    if (solutions.length >= limit) return;
    if (k === n) {
      solutions.push([...values]);
      return;
    }
    const b = order[k];
    for (const v of candidates()) {
      values[b] = v;
      if (data.pool) counts.set(v, counts.get(v) - 1);
      if (checkAt[k].every((eq) => equationHolds(eq.tokens, values))) search(k + 1);
      if (data.pool) counts.set(v, counts.get(v) + 1);
      if (solutions.length >= limit) break;
    }
    values[b] = null;
  };
  search(0);
  return { solutions };
}

// ---------------------------------------------------------------- CLI

const CHECKERS = {
  sudoku: { validate: validateSudoku, solve: (data) => solveSudoku(data.grid) },
  queens: { validate: validateQueens, solve: (data) => solveQueens(data) },
  crossmath: { validate: validateCrossmath, solve: (data) => solveCrossmath(data) },
};

function main(path) {
  if (!path) {
    console.error("Usage: npm run check-puzzle -- path/to/puzzle.json");
    return 1;
  }
  let input;
  try {
    input = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    console.error(`✖ Could not read ${path}: ${e.message}`);
    return 1;
  }

  const checker = CHECKERS[input.type];
  if (!checker) {
    console.error(`✖ "type" must be one of: ${Object.keys(CHECKERS).join(", ")} (got ${JSON.stringify(input.type)})`);
    return 1;
  }
  const shapeError = checker.validate(input.data);
  if (shapeError) {
    console.error(`✖ Invalid ${input.type} data: ${shapeError}`);
    return 1;
  }

  const { solutions, error } = checker.solve(input.data);
  if (error) {
    console.error(`✖ ${error}`);
    return 1;
  }
  if (solutions.length === 0) {
    console.error("✖ No solution. Check the puzzle data.");
    return 1;
  }
  if (solutions.length > 1) {
    console.error("✖ More than one solution. Two of them:");
    console.error(`  ${JSON.stringify(solutions[0])}`);
    console.error(`  ${JSON.stringify(solutions[1])}`);
    const advice = { sudoku: "Add more givens.", queens: "Reshape the regions.", crossmath: "Turn a blank into a given number, or change the pool." };
    console.error(`  ${advice[input.type]}`);
    return 1;
  }

  const solution = JSON.stringify(solutions[0]);
  if (input.solution !== undefined && JSON.stringify(input.solution) !== solution) {
    console.error("✖ Unique solution found, but it does NOT match the \"solution\" in your file.");
    console.error(`  Correct solution: ${solution}`);
    return 1;
  }

  console.log(`✔ ${input.type}: exactly one solution.`);
  console.log("  Store this in puzzle_solutions.solution:");
  console.log(`  ${solution}`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = main(process.argv[2]);
}
