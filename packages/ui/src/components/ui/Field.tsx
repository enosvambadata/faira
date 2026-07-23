import { ReactNode, useId } from "react";
import { cn } from "../../cn";

interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: (fieldProps: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean; required?: boolean }) => ReactNode;
}

// Shared wrapper for label + hint + contextual error message, so every
// input/select/textarea/checkbox in the app gets the same accessible
// association (aria-describedby, aria-invalid) without repeating it.
//
// The "*" is aria-hidden: required-ness is conveyed to assistive tech via
// the native `required` attribute (passed through to the field), not by
// baking an asterisk into the label's accessible name — otherwise every
// required field's accessible name becomes "Label*", which is both an
// odd screen-reader experience and breaks exact-text label lookups.
export function Field({ label, hint, error, required, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-text">
        {label}
        {required && (
          <span className="text-red ml-0.5" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children({ id, "aria-describedby": describedBy, "aria-invalid": !!error, required })}
      {hint && !error && (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className={cn("text-xs text-red")}>
          {error}
        </p>
      )}
    </div>
  );
}
