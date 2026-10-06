/**
 * Re-mounts on every navigation (unlike layout.tsx), so each page settles in
 * with a short fade-and-rise instead of snapping. See .page-enter in globals.css.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
