"use client";

import { useId, useRef, useState } from "react";
import type { GameGuide as Guide } from "./types";

/** The guide's content: goal, rules and controls. */
export function GameGuide({ guide, headingLevel = 3 }: { guide: Guide; headingLevel?: 2 | 3 }) {
  const H = headingLevel === 2 ? "h2" : "h3";
  return (
    <div className="flex flex-col gap-3 text-left text-sm leading-relaxed">
      <p className="text-base text-parchment">{guide.goal}</p>
      <div>
        <H className="mb-1 text-xs font-semibold uppercase tracking-wide text-gold">Rules</H>
        <ul className="list-disc space-y-1 pl-5 text-muted">
          {guide.rules.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </div>
      <div>
        <H className="mb-1 text-xs font-semibold uppercase tracking-wide text-gold">Controls</H>
        <ul className="list-disc space-y-1 pl-5 text-muted">
          {guide.controls.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * Compact "How to play" button that opens the guide in a dialog over the page,
 * so opening it never moves the board or the submit bar.
 */
export function HowToPlay({ guide }: { guide: Guide }) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();

  function show() {
    dialog.current?.showModal();
    setOpen(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={show}
        aria-expanded={open}
        aria-controls={id}
        aria-haspopup="dialog"
        className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg border border-rope px-2.5 text-xs font-semibold text-muted hover:border-gold/60 hover:text-parchment"
      >
        <span aria-hidden="true">?</span> How to play
      </button>
      <dialog
        ref={dialog}
        id={id}
        aria-labelledby={`${id}-title`}
        onClose={() => setOpen(false)}
        // Clicking the dimmed backdrop (the dialog element itself) closes it
        onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}
        className="sheet m-auto max-h-[85dvh] w-[min(28rem,calc(100%-2rem))] overflow-y-auto rounded-2xl border border-rope bg-deck p-5 text-parchment shadow-2xl"
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id={`${id}-title`} className="font-display text-2xl text-gold">
            How to play
          </h2>
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-xl text-muted hover:text-parchment"
            aria-label="Close how to play"
          >
            ✕
          </button>
        </div>
        <GameGuide guide={guide} />
      </dialog>
    </>
  );
}
