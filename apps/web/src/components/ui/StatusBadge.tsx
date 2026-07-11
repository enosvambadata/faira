import { cn } from "@/lib/cn";

type Tone = "neutral" | "info" | "success" | "error" | "warning";

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-light text-muted border-border",
  info: "bg-primary-light text-primary-dark border-primary-light",
  success: "bg-green/10 text-green border-green/20",
  error: "bg-red/10 text-red border-red/20",
  warning: "bg-warning/15 text-dark border-warning/30",
};

export function StatusBadge({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium", TONE_CLASSES[tone])}>
      {label}
    </span>
  );
}
