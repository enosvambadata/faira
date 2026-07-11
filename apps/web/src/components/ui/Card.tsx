import { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-lg border border-border bg-white p-5 shadow-[var(--shadow-card)]", className)}
      {...props}
    />
  );
}
