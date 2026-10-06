/** The Treasure Raid mark: a compass rose. Same drawing as app/icon.svg. */
export function CompassMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" className={className}>
      <circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.55" />
      <path d="M16 3.5 18.6 16 16 28.5 13.4 16Z" fill="currentColor" opacity="0.35" />
      <path d="M16 3.5 18.6 16H13.4Z" fill="currentColor" />
      <path d="M3.5 16 16 13.6 28.5 16 16 18.4Z" fill="currentColor" opacity="0.6" />
      <circle cx="16" cy="16" r="1.8" fill="var(--color-sea)" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
