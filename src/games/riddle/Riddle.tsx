"use client";

import { useState, type FormEvent } from "react";
import { SubmitButton } from "../SubmitButton";
import { defineGame, type GameProps } from "../types";

/** data: { "prompt": string }   answer: a JSON string */
export type RiddleData = { prompt: string };

function isRiddleData(data: unknown): data is RiddleData {
  return typeof data === "object" && data !== null && typeof (data as RiddleData).prompt === "string";
}

function Riddle({ data, onSubmit, submit }: GameProps<RiddleData>) {
  const [answer, setAnswer] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = answer.trim();
    if (trimmed) onSubmit(trimmed);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <blockquote className="whitespace-pre-line rounded-xl border-l-4 border-gold bg-deck-raised p-4 text-lg leading-relaxed">
        {data.prompt}
      </blockquote>
      <label className="flex flex-col gap-2">
        <span className="text-sm text-muted">Your answer</span>
        <input
          type="text"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={200}
          className="min-h-12 rounded-xl border border-rope bg-sea px-4 text-lg text-parchment placeholder:text-muted/60 focus:border-gold focus:outline-none"
          placeholder="Type your answer"
        />
      </label>
      <SubmitButton submit={submit} disabled={!answer.trim()} />
    </form>
  );
}

export const riddle = defineGame({
  isData: isRiddleData,
  Component: Riddle,
  guide: {
    goal: "Work out the answer to the riddle.",
    rules: [
      "Capital letters and extra spaces don't matter.",
      "A wrong answer starts the one-minute cooldown, so think before you submit.",
    ],
    controls: ["Type your answer, then press Submit answer (or Enter)."],
  },
});
