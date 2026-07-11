"use client";

import * as RadixCheckbox from "@radix-ui/react-checkbox";
import { Check } from "./icons";
import { cn } from "@/lib/cn";

interface Props {
  id?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: React.ReactNode;
  disabled?: boolean;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}

export function Checkbox({ id, checked, onCheckedChange, label, disabled, ...aria }: Props) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-2.5 text-[15px] text-text">
      <RadixCheckbox.Root
        id={id}
        checked={checked}
        onCheckedChange={value => onCheckedChange(value === true)}
        disabled={disabled}
        aria-describedby={aria["aria-describedby"]}
        aria-invalid={aria["aria-invalid"]}
        className={cn(
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-border bg-white",
          "data-[state=checked]:bg-primary data-[state=checked]:border-primary",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          "aria-[invalid=true]:border-red",
        )}
      >
        <RadixCheckbox.Indicator>
          <Check size={14} className="text-white" />
        </RadixCheckbox.Indicator>
      </RadixCheckbox.Root>
      <span>{label}</span>
    </label>
  );
}
