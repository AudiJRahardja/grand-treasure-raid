import type { Metadata } from "next";
import type { ReactNode } from "react";
import { CROSSMATH_INSTRUCTIONS } from "@/games/crossmath/instructions";

export const metadata: Metadata = { title: "Rules" };

// ✏️ Organizer: edit the prizes here.
const PRIZES = [
  { place: "🥇 1st place", prize: "Prize to be announced" },
  { place: "🥈 2nd place", prize: "Prize to be announced" },
  { place: "🥉 3rd place", prize: "Prize to be announced" },
];
const PRIZE_NOTE = "Winners are announced in the Discord server after the raid ends.";

export default function RulesPage() {
  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="font-display text-4xl text-gold">Rules of the raid</h1>
        <p className="mt-1 text-muted">Read these before you set sail.</p>
      </header>

      <Section title="How it works">
        <ul className="list-disc space-y-2 pl-5">
          <li>The raid runs for about two weeks. New checkpoints unlock on set dates during the run.</li>
          <li>Log in with Discord to play. Each checkpoint is one puzzle: a riddle, sudoku, queens or crossmath.</li>
          <li>
            The raid is for members of the <strong>BGDC Discord server</strong>. That&apos;s why Discord&apos;s login
            screen also asks to let the site <em>read your membership in servers</em>. We use it only to check
            you&apos;re in BGDC, each time you log in. We can&apos;t see your messages or other servers, and we
            don&apos;t keep your Discord token. A check lasts 21 days, so log in again if the site asks.
          </li>
          <li>
            Crossmath: {CROSSMATH_INSTRUCTIONS}
          </li>
          <li>All dates and times are shown in WIB (Asia/Jakarta).</li>
        </ul>
      </Section>

      <Section title="🧩 Playing each puzzle">
        <dl className="space-y-3">
          <Control name="Riddle">Type your answer. Capital letters and extra spaces don&apos;t matter.</Control>
          <Control name="Sudoku">
            Tap a square, then a number on the pad (⌫ erases). Clashing numbers turn red. Turn on{" "}
            <strong>✎ Notes</strong> to pencil in small candidates; notes are never submitted.
          </Control>
          <Control name="Queens">
            Tap a square once for ×, twice for a queen, three times to clear it. Press and{" "}
            <strong>drag across squares</strong> to mark many × at once: starting on an empty square adds ×, starting
            on an × removes them. Dragging never touches a queen.
          </Control>
          <Control name="Crossmath">
            Tap a blank, then tap a number below the grid. Or <strong>drag a number</strong> onto a blank. Drop it on
            a filled blank to swap, drag a placed number to another blank to move it, or drag it off the grid to put
            it back. Finished equations turn green when right and red when wrong.
          </Control>
          <Control name="Keyboard">
            Arrow keys move around the grids. Type digits for sudoku, press Enter to change a queens square, and
            Tab to a crossmath number and press Enter to place it.
          </Control>
        </dl>
        <p className="mt-3 text-sm text-muted">
          Your board is saved on this device, so reloading doesn&apos;t lose your work.
        </p>
      </Section>

      <Section title="⏱️ The timer">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            Your timer for a checkpoint starts when you press <strong>Start puzzle</strong>, not when the
            checkpoint unlocks. Start when you&apos;re ready.
          </li>
          <li>
            Once started, it keeps running until you solve it, even if you close the page. Reloading
            doesn&apos;t reset it.
          </li>
          <li>Your solve time is measured by the server, not your device&apos;s clock.</li>
        </ul>
      </Section>

      <Section title="❌ Wrong answers">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            You can make <strong>one wrong attempt per minute</strong>. After a wrong answer, wait 60 seconds
            before trying again.
          </li>
          <li>The cooldown applies across all checkpoints, not each one separately.</li>
          <li>Wrong answers don&apos;t cost points, but your timer keeps running while you wait.</li>
        </ul>
      </Section>

      <Section title="🏆 Ranking">
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            <strong>Most points</strong> first. Each checkpoint is worth its points (usually 1).
          </li>
          <li>
            If points are tied: <strong>lowest total solve time</strong> across your solved checkpoints.
          </li>
          <li>
            If still tied: <strong>whoever finished earliest</strong> (the time of your last solve).
          </li>
        </ol>
      </Section>

      <Section title="💰 Prizes">
        <ul className="space-y-2">
          {PRIZES.map((p) => (
            <li key={p.place} className="flex flex-wrap justify-between gap-2">
              <span className="font-semibold">{p.place}</span>
              <span className="text-muted">{p.prize}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-muted">{PRIZE_NOTE}</p>
      </Section>

      <Section title="🏴‍☠️ Fair play">
        <p>
          Solve the puzzles yourself and don&apos;t share answers. Every attempt is logged, and the organizer
          may remove players who cheat.
        </p>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card">
      <h2 className="mb-3 font-display text-2xl text-gold">{title}</h2>
      <div className="leading-relaxed">{children}</div>
    </section>
  );
}

function Control({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div>
      <dt className="font-semibold text-gold">{name}</dt>
      <dd className="text-sm leading-relaxed">{children}</dd>
    </div>
  );
}
