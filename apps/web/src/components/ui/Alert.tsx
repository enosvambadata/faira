import { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { AlertCircle, CheckCircle, Info } from "./icons";

type Tone = "info" | "success" | "error" | "warning";

const TONE_STYLES: Record<Tone, { container: string; icon: string }> = {
  info: { container: "bg-primary-light text-primary-dark border-primary-light", icon: "text-primary" },
  success: { container: "bg-green/10 text-green border-green/20", icon: "text-green" },
  error: { container: "bg-red/10 text-red border-red/20", icon: "text-red" },
  warning: { container: "bg-warning/15 text-dark border-warning/30", icon: "text-warning" },
};

const TONE_ICON: Record<Tone, typeof AlertCircle> = {
  info: Info,
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertCircle,
};

export function Alert({ tone = "info", children }: { tone?: Tone; children: ReactNode }) {
  const Icon = TONE_ICON[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("flex items-start gap-2.5 rounded-md border p-3.5 text-sm", TONE_STYLES[tone].container)}>
      <Icon size={18} className={cn("mt-0.5 shrink-0", TONE_STYLES[tone].icon)} />
      <div>{children}</div>
    </div>
  );
}
