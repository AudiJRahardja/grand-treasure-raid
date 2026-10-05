#!/usr/bin/env node
// Dev-only: turn a crossmath LAYOUT into a finished puzzle with exactly one solution.
//
//   npm run -s make-crossmath -- layout.json > puzzle.json
//
// layout.json:
//   {
//     "layout": [                       // up to 8 x 8, same tokens as puzzles.data.cells, plus "#"
//       ["_", "+", "_", "=", "#"],      //   "#" = result number for the script to compute
//       ...                             //   "_" = blank, filled from the pool
//     ],                                //   numbers, operators, "=", null as usual
//     "pool": [1, 2, 3, 4, 5, 6, 7, 8, 9],
//     "tries": 5000,                    // optional: random fillings to try (default 5000)
//     "seed": 42,                       // optional: repeat a previous run exactly
//     "allowNegative": false,           // optional: allow negative result numbers (default false)
//     "maxResult": 999                  // optional: largest allowed result number (default 999)
//   }
// A "#" must be the number right after an "=" and belong to only one equation.
//
// It places the pool in random orders, computes every "#" from its equation,
// skips fillings with inexact division or out-of-range results, and keeps the
// first one whose finished puzzle has exactly one solution. stdout gets the
// puzzle JSON (the same format check-puzzle reads), stderr gets the progress
// and the solution in reading order.

import { readFileSync } from "node:fs";
import {
  equationHolds,
  evaluateLeft,
  parseCrossmath,
  solveCrossmath,
  validateCrossmath,
} from "../src/games/crossmath/logic.mjs";

const log = (...args) => console.error(...args);

/** Small seeded random generator (mulberry32), so a run can be repeated. */
function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(list, rand) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function main(path) {
  if (!path) {
    log("Usage: npm run -s make-crossmath -- layout.json > puzzle.json");
    return 1;
  }
  let input;
  try {
    input = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    log(`✖ Could not read ${path}: ${e.message}`);
    return 1;
  }
  const { layout, pool } = input;
  const tries = input.tries ?? 5000;
  const seed = input.seed ?? Math.floor(Math.random() * 2 ** 31);
  const allowNegative = input.allowNegative ?? false;
  const maxResult = input.maxResult ?? 999;

  // Check the shape with every "#" standing in as a number
  if (!Array.isArray(layout)) {
    log('✖ "layout" must be a grid (array of rows)');
    return 1;
  }
  const stand = layout.map((row) => (Array.isArray(row) ? row.map((t) => (t === "#" ? 1 : t)) : row));
  const shapeError = validateCrossmath({ cells: stand, pool });
  if (shapeError) {
    log(`✖ Invalid layout: ${shapeError}`);
    return 1;
  }

  const { equations } = parseCrossmath(stand);
  const targets = []; // { r, c, tokens }: equations whose result the script computes
  for (let r = 0; r < layout.length; r++) {
    for (let c = 0; c < layout[r].length; c++) {
      if (layout[r][c] !== "#") continue;
      const inEqs = equations.filter((eq) => eq.cells.some(([er, ec]) => er === r && ec === c));
      const owner = inEqs[0];
      const [lr, lc] = owner?.cells.at(-1) ?? [];
      if (inEqs.length !== 1 || lr !== r || lc !== c) {
        log(`✖ "#" at [${r}][${c}] must be the number after an "=" and belong to only one equation`);
        return 1;
      }
      targets.push({ r, c, tokens: owner.tokens });
    }
  }
  if (targets.length === 0) log('⚠ No "#" cells: every equation must already hold, so most tries will fail.');

  log(`Seed ${seed}, up to ${tries} tries…`);
  const rand = random(seed);
  const seen = new Set();
  let skipped = 0;
  let notUnique = 0;
  const started = Date.now();

  for (let attempt = 1; attempt <= tries; attempt++) {
    const filling = shuffle(pool, rand);
    const key = filling.join(",");
    if (seen.has(key)) continue;
    seen.add(key);

    const cells = layout.map((row) => [...row]);
    let ok = true;
    for (const { r, c, tokens } of targets) {
      const v = evaluateLeft(tokens, filling);
      if (v === null || v > maxResult || (!allowNegative && v < 0)) {
        ok = false;
        break;
      }
      cells[r][c] = v;
    }
    // Equations ending in a blank or fixed number must hold too
    const finished = parseCrossmath(cells);
    if (!ok || !finished.equations.every((eq) => equationHolds(eq.tokens, filling))) {
      skipped++;
      continue;
    }

    const data = { cells, pool: [...pool].sort((a, b) => a - b) };
    const { solutions } = solveCrossmath(data);
    if (solutions.length !== 1) {
      notUnique++;
      if (notUnique % 50 === 0) log(`  …${attempt} tries, ${notUnique} had more than one solution`);
      continue;
    }

    log(`✔ Found a unique puzzle after ${attempt} tries (${((Date.now() - started) / 1000).toFixed(1)}s).`);
    log(`  Solution in reading order: ${JSON.stringify(solutions[0])}`);
    // One grid row per line, so the output is easy to read and paste
    const rows = data.cells.map((row) => `      ${JSON.stringify(row)}`).join(",\n");
    console.log(
      [
        "{",
        '  "type": "crossmath",',
        '  "data": {',
        '    "cells": [',
        rows,
        "    ],",
        `    "pool": ${JSON.stringify(data.pool)}`,
        "  },",
        `  "solution": ${JSON.stringify(solutions[0])}`,
        "}",
      ].join("\n"),
    );
    return 0;
  }

  log(`✖ No unique puzzle in ${tries} tries (${skipped} invalid fillings, ${notUnique} with several solutions).`);
  log("  Try more tries, a different pool, more operators that pin numbers down (× and ÷),");
  log("  or turn a blank into a fixed number.");
  return 1;
}

process.exitCode = main(process.argv[2]);
