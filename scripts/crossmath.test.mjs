// npm test — checks the shared crossmath rules (src/games/crossmath/logic.mjs),
// the same code the site uses to check equations in the browser.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  equationHolds,
  evaluate,
  parseCrossmath,
  solveCrossmath,
  validateCrossmath,
} from "../src/games/crossmath/logic.mjs";

const example = JSON.parse(readFileSync(new URL("./examples/crossmath.json", import.meta.url), "utf8"));
const { equations } = parseCrossmath(example.data.cells);
const allHold = (values) => equations.every((eq) => equationHolds(eq.tokens, values));

test("the example filled correctly satisfies every equation", () => {
  assert.equal(allHold(example.solution), true);
});

test("the example with two numbers swapped fails", () => {
  const swapped = [...example.solution];
  [swapped[0], swapped[1]] = [swapped[1], swapped[0]]; // 8 and 3 trade places
  assert.notDeepEqual(swapped, example.solution);
  assert.equal(allHold(swapped), false);
  const broken = equations.filter((eq) => !equationHolds(eq.tokens, swapped));
  assert.ok(broken.length >= 1, "at least one equation should break");
});

test("the example has exactly one solution, and it is the stored one", () => {
  assert.equal(validateCrossmath(example.data), null);
  const { solutions } = solveCrossmath(example.data);
  assert.deepEqual(solutions, [example.solution]);
});

test("× and ÷ before + and −, left to right within a level", () => {
  assert.equal(evaluate([6, 4, 7], ["+", "*"]), 34); // 6 + (4 × 7)
  assert.equal(evaluate([8, 2, 6], ["-", "+"]), 12); // (8 − 2) + 6, not 8 − (2 + 6)
  assert.equal(evaluate([12, 3, 2], ["/", "*"]), 8); // (12 ÷ 3) × 2, not 12 ÷ (3 × 2)
  assert.equal(evaluate([2, 12, 3, 2], ["+", "/", "*"]), 10);
});

test("every division step must be exact", () => {
  assert.equal(evaluate([7, 2], ["/"]), null);
  assert.equal(evaluate([12, 8, 2], ["/", "*"]), null); // 12 ÷ 8 is not whole, even though 12 ÷ 8 × 2 = 3
  assert.equal(evaluate([5, 0], ["/"]), null);
});

test("swappable placements are reported as more than one solution", () => {
  const data = { cells: [["_", "+", "_", "=", 9]], pool: [4, 5] };
  assert.equal(solveCrossmath(data).solutions.length, 2);
});

test("equal pool numbers swapping is still one solution", () => {
  const data = { cells: [["_", "+", "_", "=", 8]], pool: [4, 4] };
  assert.deepEqual(solveCrossmath(data).solutions, [[4, 4]]);
});

test("the validator rejects bad puzzles", () => {
  const ok = { cells: [["_", "+", 4, "=", 9]], pool: [5] };
  assert.equal(validateCrossmath(ok), null);
  assert.match(validateCrossmath({ ...ok, pool: [0] }), /1 and up/);
  assert.match(validateCrossmath({ ...ok, pool: [-5] }), /1 and up/);
  assert.match(validateCrossmath({ cells: ok.cells }), /pool/);
  assert.match(validateCrossmath({ cells: [["_", "/", 0, "=", 9]], pool: [5] }), /divides by a fixed 0/);
  const nine = Array.from({ length: 9 }, () => [null, null, null]);
  nine[0] = ["_", "=", 1];
  assert.match(validateCrossmath({ cells: nine, pool: [1] }), /1 to 8 rows/);
  assert.match(validateCrossmath({ cells: [["_", "+", 1, "+", 1, "+", 1, "=", 9]], pool: [6] }), /3 to 8 cells/);
});
