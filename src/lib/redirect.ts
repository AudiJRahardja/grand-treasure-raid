/** Only allow same-site relative paths as post-login redirect targets. */
export function safeNext(next: string | null | undefined, fallback = "/puzzles") {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback;
  }
  return next;
}
