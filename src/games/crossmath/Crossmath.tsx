"use client";

import { useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import { SubmitButton } from "../SubmitButton";
import { defineGame, type GameProps } from "../types";
import { useSavedState } from "../useSavedState";
import { equationHolds, parseCrossmath, validateCrossmath, type CrossmathData, type Token } from "./logic.mjs";

/**
 * data: { "cells": Token[][], "pool": number[] } (see logic.mjs and docs/puzzle-formats.md)
 * answer: number[], the value in each blank in reading order
 */
const isCrossmathData = (data: unknown): data is CrossmathData => validateCrossmath(data) === null;

const SYMBOL: Record<string, string> = { "+": "+", "-": "−", "*": "×", "/": "÷", "=": "=" };

/** Fixed font size per digit count, so a long number can never resize its cell */
const numberSize = (v: number) => {
  const len = String(v).length;
  return len <= 2 ? "text-lg sm:text-xl" : len === 3 ? "text-base" : "text-xs";
};

/** Which pool chip (by position, so duplicates work) sits in each blank. */
type Placement = (number | null)[];

function Crossmath({ puzzleId, data, onSubmit, submit }: GameProps<CrossmathData>) {
  const { cells, pool } = data;
  const rows = cells.length;
  const cols = cells[0].length;
  const { blanks, equations } = useMemo(() => parseCrossmath(cells), [cells]);
  const n = blanks.length;
  const blankAt = useMemo(() => new Map(blanks.map(([r, c], i) => [`${r},${c}`, i])), [blanks]);

  const [placement, setPlacement] = useSavedState<Placement>(
    `crossmath:${puzzleId}`,
    () => new Array<number | null>(n).fill(null),
    (saved): saved is Placement => {
      if (!Array.isArray(saved) || saved.length !== n) return false;
      const used = saved.filter((v) => v !== null);
      return (
        used.every((v) => Number.isInteger(v) && v >= 0 && v < pool.length) && new Set(used).size === used.length
      );
    },
  );
  const [selected, setSelected] = useState<number | null>(0);

  const values = placement.map((chip) => (chip === null ? null : pool[chip]));
  const chipOwner = new Map(placement.flatMap((chip, blank) => (chip === null ? [] : [[chip, blank] as const])));
  const filled = values.filter((v) => v !== null).length;

  // Live check: an equation is judged once all its blanks are filled
  const status = new Map<string, "good" | "bad">();
  let anyBad = false;
  for (const eq of equations) {
    if (!eq.blanks.every((b) => values[b] !== null)) continue;
    const ok = equationHolds(eq.tokens, values);
    if (!ok) anyBad = true;
    for (const [r, c] of eq.cells) {
      const key = `${r},${c}`;
      if (!ok) status.set(key, "bad");
      else if (status.get(key) !== "bad") status.set(key, "good");
    }
  }
  const complete = filled === n;

  function nextEmpty(after: number, p: Placement) {
    for (let k = 1; k <= n; k++) {
      const b = (after + k) % n;
      if (p[b] === null) return b;
    }
    return after;
  }

  function place(chip: number) {
    if (selected === null) return;
    const owner = chipOwner.get(chip);
    if (owner === selected) {
      // Tapping the chip that's already here takes it back
      setPlacement((p) => p.map((v, b) => (b === selected ? null : v)));
      return;
    }
    const next = [...placement];
    if (owner !== undefined) next[owner] = placement[selected]; // swap with the other blank
    next[selected] = chip;
    setPlacement(next);
    if (owner === undefined) setSelected(nextEmpty(selected, next));
  }

  function erase() {
    if (selected === null) return;
    setPlacement((p) => p.map((v, b) => (b === selected ? null : v)));
  }

  function focusBlank(b: number) {
    setSelected(b);
    document.getElementById(`crossmath-${b}`)?.focus();
  }

  function handleKeyDown(e: KeyboardEvent, b: number) {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      focusBlank((b + 1) % n);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      focusBlank((b - 1 + n) % n);
    } else if (e.key === "Backspace" || e.key === "Delete") {
      erase();
    } else if (/^[1-9]$/.test(e.key)) {
      // Place the first free chip with that value
      const chip = pool.findIndex((v, i) => v === Number(e.key) && !chipOwner.has(i));
      if (chip !== -1) place(chip);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (complete && !anyBad) onSubmit(values as number[]);
  }

  function clearAll() {
    if (window.confirm("Take all numbers off the board?")) {
      setPlacement(new Array<number | null>(n).fill(null));
      setSelected(0);
    }
  }

  const ring = (key: string) =>
    status.get(key) === "bad"
      ? "ring-2 ring-inset ring-danger bg-danger/15"
      : status.get(key) === "good"
        ? "ring-2 ring-inset ring-success/80"
        : "";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <p className="text-center text-sm text-muted">
        Place every number so each row and column adds up. × and ÷ come before + and −, left to right. Every
        division must be exact.
      </p>

      <div
        role="grid"
        aria-label={`Crossmath, ${rows} rows by ${cols} columns. Arrow keys move between blanks, 1 to 9 place a number.`}
        className="mx-auto grid w-full gap-px"
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
          aspectRatio: `${cols} / ${rows}`,
          maxWidth: `${cols * 3.5}rem`,
        }}
      >
        {cells.map((row, r) =>
          row.map((t: Token, c) => {
            const key = `${r},${c}`;
            const base = "relative min-h-0 min-w-0 overflow-hidden rounded-md";
            if (t === null) return <div key={key} aria-hidden="true" />;

            if (t === "_") {
              const b = blankAt.get(key)!;
              const v = values[b];
              const isSelected = selected === b;
              return (
                <button
                  key={key}
                  id={`crossmath-${b}`}
                  type="button"
                  role="gridcell"
                  tabIndex={b === (selected ?? 0) ? 0 : -1}
                  aria-selected={isSelected}
                  aria-label={`Blank ${b + 1} of ${n}, row ${r + 1}, column ${c + 1}: ${v ?? "empty"}${status.get(key) === "bad" ? ", equation wrong" : ""}`}
                  onClick={() => setSelected(b)}
                  onKeyDown={(e) => handleKeyDown(e, b)}
                  className={`${base} border-2 p-0 outline-none focus-visible:ring-2 focus-visible:ring-gold ${
                    isSelected ? "border-gold bg-gold/25" : v === null ? "border-dashed border-rope bg-sea" : "border-gold/50 bg-deck"
                  } ${ring(key)}`}
                >
                  {v !== null && (
                    <span
                      aria-hidden="true"
                      className={`absolute inset-0 flex items-center justify-center font-semibold leading-none tabular-nums text-gold-strong ${numberSize(v)}`}
                    >
                      {v}
                    </span>
                  )}
                </button>
              );
            }

            const isNumber = typeof t === "number";
            return (
              <div
                key={key}
                role="gridcell"
                aria-label={isNumber ? String(t) : { "+": "plus", "-": "minus", "*": "times", "/": "divided by", "=": "equals" }[t]}
                className={`${base} ${isNumber ? "bg-deck-raised" : ""} ${ring(key)}`}
              >
                <span
                  aria-hidden="true"
                  className={`absolute inset-0 flex items-center justify-center leading-none tabular-nums ${
                    isNumber ? `font-bold text-parchment ${numberSize(t)}` : "text-xl text-gold/80"
                  }`}
                >
                  {isNumber ? t : SYMBOL[t]}
                </span>
              </div>
            );
          }),
        )}
      </div>

      <div className="mx-auto flex w-full max-w-md flex-wrap justify-center gap-2" aria-label="Numbers to place">
        {pool.map((v, chip) => {
          const used = chipOwner.has(chip);
          return (
            <button
              key={chip}
              type="button"
              onClick={() => place(chip)}
              disabled={selected === null}
              aria-label={used ? `${v}, placed (tap to move it here)` : `Place ${v}`}
              className={`btn btn-secondary min-h-12 min-w-12 px-3 text-xl tabular-nums ${used ? "opacity-35" : ""}`}
            >
              {v}
            </button>
          );
        })}
        <button
          type="button"
          onClick={erase}
          disabled={selected === null || values[selected] === null}
          aria-label="Take the number out of the selected blank"
          className="btn btn-secondary min-h-12 min-w-12 px-3 text-xl"
        >
          ⌫
        </button>
      </div>

      <div className="mx-auto flex w-full max-w-md items-center justify-between text-sm text-muted">
        <span aria-live="polite">
          {anyBad ? <span className="text-danger">Some equations don&apos;t work (in red)</span> : `${filled}/${n} placed`}
        </span>
        <button type="button" onClick={clearAll} className="nav-link min-h-9">
          Clear
        </button>
      </div>

      <SubmitButton
        submit={submit}
        disabled={!complete || anyBad}
        hint={complete ? "Fix the red equations to submit." : "Place every number to submit."}
      />
    </form>
  );
}

export const crossmath = defineGame({ isData: isCrossmathData, Component: Crossmath });
