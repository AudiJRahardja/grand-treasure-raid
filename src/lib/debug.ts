/** Dev-only: print a Supabase query's full result to the server terminal. */
export function logQuery(label: string, result: { data: unknown; error: unknown }) {
  if (process.env.NODE_ENV === "production") return;
  console.log(
    `[supabase] ${label}\n  data: ${JSON.stringify(result.data)}\n  error: ${JSON.stringify(result.error)}`,
  );
}
