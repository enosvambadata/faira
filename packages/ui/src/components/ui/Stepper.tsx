import { cn } from "../../cn";
import { Check } from "./icons";

interface Props {
  steps: string[];
  currentStep: number; // 0-indexed
}

// A simple linear progress bar + step count on mobile widths, and a full
// labeled stepper on wider screens — a 9-11 step wizard's full label row
// doesn't fit on a small phone screen without becoming unreadable.
export function Stepper({ steps, currentStep }: Props) {
  const percent = Math.round(((currentStep + 1) / steps.length) * 100);

  return (
    <div>
      <div className="flex items-center justify-between text-sm text-muted mb-2 sm:hidden">
        <span>
          Step {currentStep + 1} of {steps.length}
        </span>
        <span className="font-medium text-text">{steps[currentStep]}</span>
      </div>
      <div className="h-2 w-full rounded-full bg-border sm:hidden" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
      </div>

      <ol className="hidden sm:flex items-center w-full">
        {steps.map((step, index) => {
          const isComplete = index < currentStep;
          const isCurrent = index === currentStep;
          return (
            <li key={step} className="flex flex-1 items-center last:flex-none">
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-medium",
                    isComplete && "border-primary bg-primary text-white",
                    isCurrent && !isComplete && "border-primary text-primary",
                    !isComplete && !isCurrent && "border-border text-muted",
                  )}
                  aria-current={isCurrent ? "step" : undefined}
                >
                  {isComplete ? <Check size={16} /> : index + 1}
                </div>
                <span className={cn("text-xs text-center max-w-20", isCurrent ? "text-text font-medium" : "text-muted")}>
                  {step}
                </span>
              </div>
              {index < steps.length - 1 && (
                <div className={cn("mx-2 h-0.5 flex-1", isComplete ? "bg-primary" : "bg-border")} />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
