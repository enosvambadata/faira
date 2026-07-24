"use client";

import * as RadixRadioGroup from "@radix-ui/react-radio-group";
import { cn } from "../../cn";

export interface RadioOption {
  value: string;
  label: string;
  description?: string;
}

interface Props {
  value: string | undefined;
  onValueChange: (value: string) => void;
  options: RadioOption[];
  "aria-describedby"?: string;
  name?: string;
}

// Large tappable cards rather than tiny native radio dots — this is used
// for seller-type and yes/no style choices where a big touch target
// matters more on a phone than density does.
export function RadioGroup({ value, onValueChange, options, name, ...aria }: Props) {
  return (
    <RadixRadioGroup.Root
      value={value}
      onValueChange={onValueChange}
      name={name}
      aria-describedby={aria["aria-describedby"]}
      className="flex flex-col gap-2.5"
    >
      {options.map(option => (
        <RadixRadioGroup.Item
          key={option.value}
          value={option.value}
          className={cn(
            "group flex items-start gap-3 rounded-md border border-border bg-white p-4 text-left",
            "data-[state=checked]:border-primary data-[state=checked]:bg-primary-light",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          )}
        >
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-border group-data-[state=checked]:border-primary">
            <RadixRadioGroup.Indicator className="h-2.5 w-2.5 rounded-full bg-primary" />
          </span>
          <span className="flex flex-col gap-0.5">
            <span className="font-medium text-text">{option.label}</span>
            {option.description && <span className="text-sm text-muted">{option.description}</span>}
          </span>
        </RadixRadioGroup.Item>
      ))}
    </RadixRadioGroup.Root>
  );
}
