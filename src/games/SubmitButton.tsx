import type { SubmitState } from "./types";

/**
 * Shared submit bar, sticky to the bottom of the screen so it stays reachable
 * under tall boards on phones. Shows "Checking…", the cooldown countdown, the
 * last attempt's message, and an optional hint while the board is incomplete.
 */
export function SubmitButton({
  submit,
  disabled = false,
  hint,
}: {
  submit: SubmitState;
  disabled?: boolean;
  /** Shown under the button while `disabled` (e.g. "Fill every cell to submit.") */
  hint?: string;
}) {
  const cooling = submit.cooldownLeft > 0;
  const label = submit.pending ? "Checking…" : cooling ? `Try again in ${submit.cooldownLeft}s` : "Submit answer";
  const { message } = submit;

  return (
    <div className="sticky bottom-0 z-20 -mx-4 border-t border-rope/70 bg-sea/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
      <div className="mx-auto flex w-full max-w-md flex-col gap-2">
        {message && (
          <p
            role="alert"
            className={`rounded-lg border px-3 py-2 text-sm ${
              message.tone === "error" ? "border-danger/60 text-danger" : "border-gold/50 text-parchment"
            }`}
          >
            {message.tone === "wrong" && <span aria-hidden="true">✖ </span>}
            {message.text}
          </p>
        )}
        <button
          type="submit"
          className="btn btn-primary w-full"
          disabled={disabled || submit.pending || cooling}
          aria-live="polite"
        >
          {label}
        </button>
        {hint && disabled && !cooling && !submit.pending && (
          <p className="text-center text-xs text-muted">{hint}</p>
        )}
      </div>
    </div>
  );
}
