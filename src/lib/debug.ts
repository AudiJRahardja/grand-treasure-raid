/**
 * Dev-only: print a Supabase query's full result to the server terminal.
 * Next.js inlines NODE_ENV at build time, so production builds compile this to a no-op.
 */
export function logQuery(label: string, result: { data: unknown; error: unknown }) {
  if (process.env.NODE_ENV !== "development") return;
  console.log(
    `[supabase] ${label}\n  data: ${JSON.stringify(result.data)}\n  error: ${JSON.stringify(result.error)}`,
  );
}
