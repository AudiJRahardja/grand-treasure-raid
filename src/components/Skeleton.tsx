import type { ReactNode } from "react";

/** A grey placeholder block that pulses while content loads (still if the user prefers less motion). */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`rounded-xl bg-deck-raised/80 motion-safe:animate-pulse ${className}`} />;
}

/** Wraps a loading layout so screen readers hear one short message instead of the placeholders. */
export function LoadingRegion({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-5">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
