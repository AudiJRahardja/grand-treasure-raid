// Crossmath rules, shared by the browser (Crossmath.tsx) and the dev scripts
// (check-puzzle, make-crossmath, tests). Plain JavaScript so Node can run it
// directly; types live in logic.d.mts. Keep this file free of imports.
//
// data.cells is a grid (at most 8 x 8) of tokens:
//   null             gap (no cell)
//   integer          fixed number
//   "_"              blank, filled from data.pool
//   "+" "-" "*" "/"  operator (shown as + − × ÷)
//   "="              equals
// Every horizontal or vertical run of 2+ adjacent cells is one equation:
//   operand (op operand)* = operand        (operand = integer or "_")
// × and ÷ before + and −, left to right within the same level. Every division
// step must be exact. data.pool lists the numbers for the blanks (whole numbers
// 1 and up), each used exactly once; duplicates are allowed.

export const MAX_SIZE = 8;

const isOp = (t) => t === "+" || t === "-" || t === "*" || t === "/";
const isOperand = (t) => t === "_" || Number.isInteger(t);

/**
 * Finds the blanks (reading order) and the equations. Each equation token is
 * { t } or, for a blank, { t: "_", blank: <index into blanks> }.
 */
export function parseCrossmath(cells) {
  const blanks = [];
  const blankIndex = new Map();
  cells.forEach((row, r) =>
    row.forEach((t, c) => {
      if (t === "_") {
        blankIndex.set(`${r},${c}`, blanks.length);
        blanks.push([r, c]);
      }
    }),
  );

  const rows = cells.length;
  const cols = cells[0]?.length ?? 0;
  const equations = [];
  const covered = new Set();

  for (const dir of ["row", "col"]) {
    const outer = dir === "row" ? rows : cols;
    const inner = dir === "row" ? cols : rows;
    for (let i = 0; i < outer; i++) {
      let run = [];
      for (let j = 0; j <= inner; j++) {
        const [r, c] = dir === "row" ? [i, j] : [j, i];
        const t = j < inner ? cells[r][c] : null;
        if (t !== null) {
          run.push([r, c]);
          continue;
        }
        if (run.length >= 2) {
          const tokens = run.map(([rr, cc]) => {
            covered.add(`${rr},${cc}`);
            const tok = cells[rr][cc];
            return tok === "_" ? { t: tok, blank: blankIndex.get(`${rr},${cc}`) } : { t: tok };
          });
          const eqBlanks = [...new Set(tokens.filter((x) => x.t === "_").map((x) => x.blank))];
          equations.push({ dir, cells: run, tokens, blanks: eqBlanks });
        }
        run = [];
      }
    }
  }
  return { blanks, equations, covered };
}

/** Returns an error message, or null if `data` is a well-formed crossmath puzzle. */
export function validateCrossmath(data) {
  const cells = data?.cells;
  if (!Array.isArray(cells) || cells.length < 1 || cells.length > MAX_SIZE) {
    return `data.cells must have 1 to ${MAX_SIZE} rows`;
  }
  const width = Array.isArray(cells[0]) ? cells[0].length : 0;
  if (width < 3 || width > MAX_SIZE) return `each row must have 3 to ${MAX_SIZE} cells`;
  for (let r = 0; r < cells.length; r++) {
    if (!Array.isArray(cells[r]) || cells[r].length !== width) return `row ${r} must have ${width} cells`;
    for (let c = 0; c < width; c++) {
      const t = cells[r][c];
      if (!(t === null || t === "=" || isOp(t) || isOperand(t))) {
        return `cell [${r}][${c}] must be null, a whole number, "_", "+", "-", "*", "/" or "=" (got ${JSON.stringify(t)})`;
      }
    }
  }

  const { blanks, equations, covered } = parseCrossmath(cells);
  if (blanks.length === 0) return 'there are no blanks ("_") to fill';

  for (const eq of equations) {
    const where = `${eq.dir} equation starting at [${eq.cells[0]}]`;
    const ts = eq.tokens.map((x) => x.t);
    const eqAt = ts.indexOf("=");
    if (eqAt === -1 || ts.lastIndexOf("=") !== eqAt) return `${where} needs exactly one "="`;
    if (eqAt !== ts.length - 2 || !isOperand(ts.at(-1))) {
      return `${where}: "=" must be followed by exactly one number or blank`;
    }
    if (eqAt % 2 !== 1) return `${where}: the left side must end with a number or blank`;
    for (let i = 0; i < eqAt; i++) {
      const wantOperand = i % 2 === 0;
      if (wantOperand ? !isOperand(ts[i]) : !isOp(ts[i])) {
        return `${where}: expected ${wantOperand ? "a number or blank" : "an operator"} at position ${i + 1}`;
      }
      if (ts[i] === "/" && ts[i + 1] === 0) return `${where}: divides by a fixed 0`;
    }
  }
  for (let r = 0; r < cells.length; r++) {
    for (let c = 0; c < width; c++) {
      if (cells[r][c] !== null && !covered.has(`${r},${c}`)) return `cell [${r}][${c}] is not part of any equation`;
    }
  }
  for (const [r, c] of blanks) {
    if (!equations.some((eq) => eq.cells.some(([er, ec]) => er === r && ec === c))) {
      return `blank [${r}][${c}] is not part of any equation`;
    }
  }

  const pool = data.pool;
  if (!Array.isArray(pool)) return "data.pool (the numbers to place) is required";
  if (!pool.every((v) => Number.isInteger(v) && v >= 1)) return "data.pool may only contain whole numbers 1 and up";
  if (pool.length !== blanks.length) return `data.pool has ${pool.length} numbers but there are ${blanks.length} blanks`;
  return null;
}

/**
 * Value of values[0] ops[0] values[1] ..., with × and ÷ before + and −, left
 * to right within each level. Returns null if any division step isn't exact.
 */
export function evaluate(values, ops) {
  let total = 0;
  let sign = 1;
  let term = values[0];
  for (let i = 0; i < ops.length; i++) {
    const v = values[i + 1];
    const op = ops[i];
    if (op === "*") term *= v;
    else if (op === "/") {
      if (v === 0 || term % v !== 0) return null;
      term /= v;
    } else {
      total += sign * term;
      sign = op === "+" ? 1 : -1;
      term = v;
    }
  }
  return total + sign * term;
}

/** Value of an equation's left side, or null if a blank is empty or a division isn't exact. */
export function evaluateLeft(tokens, blankValues) {
  const left = tokens.slice(0, -2);
  const values = [];
  const ops = [];
  for (let i = 0; i < left.length; i++) {
    const x = left[i];
    if (i % 2 === 1) ops.push(x.t);
    else {
      const v = x.t === "_" ? blankValues[x.blank] : x.t;
      if (v === null || v === undefined) return null;
      values.push(v);
    }
  }
  return evaluate(values, ops);
}

/** True if the equation holds for these blank values (all of its blanks must be filled). */
export function equationHolds(tokens, blankValues) {
  const last = tokens.at(-1);
  const right = last.t === "_" ? blankValues[last.blank] : last.t;
  if (right === null || right === undefined) return false;
  const left = evaluateLeft(tokens, blankValues);
  return left !== null && left === right;
}

/**
 * Backtracking search for up to `limit` solutions (arrays of blank values in
 * reading order). Each equation is checked as soon as its last blank is
 * placed, so dead ends are cut early. Equal pool numbers are tried once per
 * position, so swapping two equal numbers doesn't count as a second solution.
 */
export function solveCrossmath(data, limit = 2) {
  const { blanks, equations } = parseCrossmath(data.cells);
  const n = blanks.length;

  if (equations.some((eq) => eq.blanks.length === 0 && !equationHolds(eq.tokens, []))) {
    return { solutions: [], error: "an equation with no blanks is false" };
  }

  // Fill order: always the blank that brings some equation closest to complete
  const order = [];
  const placed = new Set();
  while (order.length < n) {
    let best = -1;
    let bestScore = Infinity;
    for (let b = 0; b < n; b++) {
      if (placed.has(b)) continue;
      let score = Infinity;
      for (const eq of equations) {
        if (eq.blanks.includes(b)) score = Math.min(score, eq.blanks.filter((x) => !placed.has(x)).length);
      }
      if (score < bestScore) [best, bestScore] = [b, score];
    }
    order.push(best);
    placed.add(best);
  }
  // Equations that become complete at step k of the order
  const step = new Map(order.map((b, k) => [b, k]));
  const checkAt = Array.from({ length: n }, () => []);
  for (const eq of equations) {
    if (eq.blanks.length) checkAt[Math.max(...eq.blanks.map((b) => step.get(b)))].push(eq.tokens);
  }

  const remaining = new Map();
  for (const v of data.pool) remaining.set(v, (remaining.get(v) ?? 0) + 1);
  const distinct = [...remaining.keys()];

  const values = new Array(n).fill(null);
  const solutions = [];
  const search = (k) => {
    if (k === n) {
      solutions.push([...values]);
      return;
    }
    const b = order[k];
    for (const v of distinct) {
      if (remaining.get(v) === 0) continue;
      values[b] = v;
      remaining.set(v, remaining.get(v) - 1);
      if (checkAt[k].every((tokens) => equationHolds(tokens, values))) search(k + 1);
      remaining.set(v, remaining.get(v) + 1);
      if (solutions.length >= limit) break;
    }
    values[b] = null;
  };
  search(0);
  return { solutions };
}
