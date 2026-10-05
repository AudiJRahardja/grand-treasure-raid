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
import { solveCrossmath, validateCrossmath } from "../src/games/crossmath/logic.mjs";

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
// The rules live in one file shared with the site: src/games/crossmath/logic.mjs

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
    const advice = { sudoku: "Add more givens.", queens: "Reshape the regions.", crossmath: "Turn a blank into a fixed number, change the pool, or try npm run make-crossmath." };
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
