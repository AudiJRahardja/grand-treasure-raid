import type { SubmitState } from "./types";

/** Shared submit button: shows "Checking…" and the cooldown countdown. */
export function SubmitButton({ submit, disabled = false }: { submit: SubmitState; disabled?: boolean }) {
  const cooling = submit.cooldownLeft > 0;
  const label = submit.pending ? "Checking…" : cooling ? `Try again in ${submit.cooldownLeft}s` : "Submit answer";

  return (
    <button
      type="submit"
      className="btn btn-primary w-full"
      disabled={disabled || submit.pending || cooling}
      aria-live="polite"
    >
      {label}
    </button>
  );
}
