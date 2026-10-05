"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Countdown, ElapsedTimer } from "@/components/Countdown";
import { ErrorNotice } from "@/components/Notice";
import { GAMES } from "@/games/registry";
import { getServerOffset, useServerNow } from "@/lib/server-clock";
import { createClient } from "@/lib/supabase/client";
import { formatDuration, formatWIB } from "@/lib/time";
import type { StartedPuzzle, SubmitResult } from "@/lib/types";

export type NextCheckpoint =
  | { kind: "open"; id: number; checkpoint: number }
  | { kind: "locked"; checkpoint: number; opensAt: string }
  | { kind: "none" };

type Props = {
  puzzleId: number;
  started: boolean;
  solvedSeconds: number | null;
  /** End of the current wrong-answer cooldown (ISO, server time), if any */
  cooldownUntil: string | null;
  next: NextCheckpoint;
};

type Phase =
  | { name: "intro" }
  | { name: "starting" }
  | { name: "playing"; puzzle: StartedPuzzle }
  | { name: "solved"; seconds: number; justNow: boolean }
  | { name: "error"; message: string };

type Feedback = { tone: "wrong" | "cooldown" | "error"; text: string } | null;

/** Turn RPC exceptions from start_puzzle / submit_answer into player-friendly text. */
function friendlyError(message: string) {
  if (/not logged in/i.test(message)) return "Your session expired. Please log in again.";
  if (/not available/i.test(message))
    return "This checkpoint isn't available. It may not be open yet, or the raid has ended.";
  if (/start the puzzle first/i.test(message)) return "Press Start before submitting.";
  return message;
}

async function startPuzzle(puzzleId: number): Promise<Phase> {
  const { data, error } = await createClient().rpc("start_puzzle", { p_puzzle_id: puzzleId });
  if (error) return { name: "error", message: friendlyError(error.message) };
  return { name: "playing", puzzle: data as StartedPuzzle };
}

export function PuzzlePlayer({ puzzleId, started, solvedSeconds, cooldownUntil, next }: Props) {
  const [phase, setPhase] = useState<Phase>(() =>
    solvedSeconds !== null
      ? { name: "solved", seconds: solvedSeconds, justNow: false }
      : started
        ? { name: "starting" }
        : { name: "intro" },
  );
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [pending, setPending] = useState(false);
  const [cooldownEnd, setCooldownEnd] = useState<number | null>(
    cooldownUntil ? new Date(cooldownUntil).getTime() : null,
  );
  const now = useServerNow();
  const cooldownLeft = now !== null && cooldownEnd !== null ? Math.max(0, Math.ceil((cooldownEnd - now) / 1000)) : 0;

  // Already started earlier: fetch the content again (the timer keeps its original start)
  useEffect(() => {
    if (!started || solvedSeconds !== null) return;
    let cancelled = false;
    startPuzzle(puzzleId).then((p) => {
      if (!cancelled) setPhase(p);
    });
    return () => {
      cancelled = true;
    };
  }, [puzzleId, started, solvedSeconds]);

  async function handleStart() {
    setPhase({ name: "starting" });
    setPhase(await startPuzzle(puzzleId));
  }

  async function handleSubmit(answer: unknown) {
    if (pending) return;
    setPending(true);
    setFeedback(null);
    const { data, error } = await createClient().rpc("submit_answer", {
      p_puzzle_id: puzzleId,
      p_answer: answer,
    });
    setPending(false);

    if (error) {
      setFeedback({ tone: "error", text: friendlyError(error.message) });
      return;
    }
    const result = data as SubmitResult;
    const coolFor = async (seconds: number) =>
      setCooldownEnd(Date.now() + (await getServerOffset()) + seconds * 1000);

    if ("already_solved" in result) {
      setFeedback({ tone: "error", text: "You've already solved this checkpoint. Reload to see your time." });
    } else if (!result.ok) {
      await coolFor(result.retry_in_seconds);
      setFeedback({
        tone: "cooldown",
        text: "Easy there, captain! Only one wrong answer per minute, across all checkpoints.",
      });
    } else if (result.correct) {
      setPhase({ name: "solved", seconds: result.solve_seconds, justNow: true });
    } else {
      await coolFor(result.retry_in_seconds);
      setFeedback({ tone: "wrong", text: "Not quite. Check your answer and try again when the cooldown ends." });
    }
  }

  if (phase.name === "intro") {
    return (
      <div className="card flex flex-col gap-4 text-center">
        <p className="text-lg">Ready, captain?</p>
        <p className="text-sm text-muted">
          Your timer starts the moment you press <strong className="text-parchment">Start puzzle</strong>, and it
          keeps running even if you leave or reload the page. Faster solves rank higher.
        </p>
        <button type="button" onClick={handleStart} className="btn btn-primary self-center px-10">
          Start puzzle
        </button>
      </div>
    );
  }

  if (phase.name === "starting") {
    return (
      <div className="card text-center text-muted" role="status">
        Unrolling the map…
      </div>
    );
  }

  if (phase.name === "error") {
    return (
      <div className="flex flex-col gap-4">
        <ErrorNotice title="Can't open this checkpoint">{phase.message}</ErrorNotice>
        <Link href="/puzzles" className="btn btn-secondary self-start">
          Back to checkpoints
        </Link>
      </div>
    );
  }

  if (phase.name === "solved") {
    return <Solved seconds={phase.seconds} justNow={phase.justNow} next={next} />;
  }

  const game = GAMES[phase.puzzle.type];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between rounded-xl border border-rope bg-deck-raised px-4 py-3">
        <span className="text-sm text-muted">Your time</span>
        <span className="font-mono text-xl text-gold" aria-live="off">
          <ElapsedTimer from={phase.puzzle.opened_at} />
        </span>
      </div>

      {!game ? (
        <ErrorNotice title="Unsupported puzzle">
          This site can&apos;t display &ldquo;{phase.puzzle.type}&rdquo; puzzles yet. Tell the organizer.
        </ErrorNotice>
      ) : !game.isData(phase.puzzle.data) ? (
        <ErrorNotice title="Puzzle data problem">
          This checkpoint&apos;s data doesn&apos;t match the {phase.puzzle.type} format. Tell the organizer.
        </ErrorNotice>
      ) : (
        <game.Component data={phase.puzzle.data} onSubmit={handleSubmit} submit={{ pending, cooldownLeft }} />
      )}

      {feedback && (
        <p
          role="alert"
          className={`rounded-xl border p-3 text-sm ${
            feedback.tone === "error" ? "border-danger/60 text-danger" : "border-gold/50 text-parchment"
          }`}
        >
          {feedback.tone === "wrong" && <span aria-hidden="true">✖ </span>}
          {feedback.text}
        </p>
      )}
    </div>
  );
}

function Solved({ seconds, justNow, next }: { seconds: number; justNow: boolean; next: NextCheckpoint }) {
  return (
    <div className="card flex flex-col items-center gap-4 border-gold/60 text-center">
      <div aria-hidden="true" className={`text-6xl ${justNow ? "animate-bounce" : ""}`}>
        💰
      </div>
      <h2 className="font-display text-4xl text-gold">{justNow ? "Treasure found!" : "Already solved"}</h2>
      <p className="text-lg">
        Solved in <strong className="font-mono text-gold">{formatDuration(seconds)}</strong>
      </p>

      <div className="flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
        {next.kind === "open" && (
          <Link href={`/puzzles/${next.id}`} className="btn btn-primary">
            Next: Checkpoint {next.checkpoint} →
          </Link>
        )}
        <Link href="/leaderboard" className="btn btn-secondary">
          Leaderboard
        </Link>
        <Link href="/puzzles" className="btn btn-secondary">
          All checkpoints
        </Link>
      </div>

      {next.kind === "locked" && (
        <p className="text-sm text-muted">
          Checkpoint {next.checkpoint} opens {formatWIB(next.opensAt)} (in <Countdown to={next.opensAt} />)
        </p>
      )}
      {next.kind === "none" && <p className="text-sm text-muted">That was the last checkpoint. Well sailed!</p>}
    </div>
  );
}
