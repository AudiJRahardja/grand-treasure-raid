"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import Link from "next/link";

/** Shown when a page crashes unexpectedly (lost connection, Supabase down, a bug). */
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-4 py-10 text-center">
      <div aria-hidden="true" className="text-5xl">
        🌊
      </div>
      <h1 className="font-display text-4xl text-gold">Rough seas</h1>
      <p className="text-muted">
        Something went wrong loading this page. Check your connection and try again. Your puzzle progress and timer
        are safe.
      </p>
      {error.digest && <p className="text-xs text-muted">Error code: {error.digest}</p>}
      <div className="flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
        <button type="button" onClick={() => retry()} className="btn btn-primary">
          Try again
        </button>
        <Link href="/" className="btn btn-secondary">
          Home
        </Link>
      </div>
    </div>
  );
}
