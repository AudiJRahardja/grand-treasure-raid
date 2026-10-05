import Link from "next/link";

// Placeholder: the full landing page (event name, countdown) arrives in milestone 3.
export default function Home() {
  return (
    <div className="flex flex-col items-center gap-6 py-10 text-center">
      <h1 className="font-display text-5xl text-gold">The Grand Treasure Raid</h1>
      <p className="max-w-md text-muted">Solve the checkpoints, race the clock, claim the treasure.</p>
      <Link href="/puzzles" className="btn btn-primary">Go to puzzles</Link>
    </div>
  );
}
