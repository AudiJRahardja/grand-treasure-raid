import Link from "next/link";

// Placeholder: the Start/Submit flow and game components arrive in milestone 2.
export default async function PuzzlePage(props: PageProps<"/puzzles/[id]">) {
  const { id } = await props.params;
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-4xl text-gold">Puzzle #{id}</h1>
      <p className="text-muted">The puzzle page is not built yet.</p>
      <Link href="/puzzles" className="btn btn-secondary self-start">
        Back to checkpoints
      </Link>
    </div>
  );
}
