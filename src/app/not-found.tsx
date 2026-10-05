import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-10 text-center">
      <div aria-hidden="true" className="text-5xl">
        🧭
      </div>
      <p className="font-display text-6xl text-gold">404</p>
      <h1 className="font-display text-3xl text-parchment">Off the map</h1>
      <p className="text-muted">This page doesn&apos;t exist. Maybe the treasure is buried somewhere else.</p>
      <div className="flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
        <Link href="/puzzles" className="btn btn-primary">
          Checkpoints
        </Link>
        <Link href="/" className="btn btn-secondary">
          Home
        </Link>
      </div>
    </div>
  );
}
