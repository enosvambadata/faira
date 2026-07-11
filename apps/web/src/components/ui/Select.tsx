"use client";

import * as RadixSelect from "@radix-ui/react-select";
import { Check, ChevronDown } from "./icons";
import { cn } from "@/lib/cn";

export interface SelectOption {
  value: string;
  label: string;
}

interface Props {
  id?: string;
  value: string | undefined;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  disabled?: boolean;
}

export function Select({ id, value, onValueChange, options, placeholder = "Select…", disabled, ...aria }: Props) {
  // Radix's Root must receive a string on every render, never undefined,
  // or React logs a "changing from uncontrolled to controlled" warning
  // the first time a value gets picked. Callers may still pass undefined
  // for "nothing selected yet" — normalize it here rather than in every
  // call site.
  return (
    <RadixSelect.Root value={value ?? ""} onValueChange={onValueChange} disabled={disabled}>
      <RadixSelect.Trigger
        id={id}
        aria-describedby={aria["aria-describedby"]}
        aria-invalid={aria["aria-invalid"]}
        className={cn(
          "flex h-11 w-full items-center justify-between rounded-md border border-border bg-white px-3.5 text-[15px] text-text",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-primary",
          "aria-[invalid=true]:border-red aria-[invalid=true]:ring-red",
          "data-[placeholder]:text-muted disabled:bg-light disabled:text-muted",
        )}
      >
        <RadixSelect.Value placeholder={placeholder} />
        <RadixSelect.Icon>
          <ChevronDown size={18} className="text-muted" />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content
          position="popper"
          sideOffset={4}
          className="z-50 max-h-72 w-[var(--radix-select-trigger-width)] overflow-y-auto rounded-md border border-border bg-white shadow-modal"
        >
          <RadixSelect.Viewport className="p-1">
            {options.map(option => (
              <RadixSelect.Item
                key={option.value}
                value={option.value}
                className={cn(
                  "flex cursor-pointer items-center justify-between rounded-sm px-3 py-2.5 text-[15px] text-text outline-none",
                  "data-[highlighted]:bg-primary-light data-[highlighted]:text-primary-dark",
                )}
              >
                <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
                <RadixSelect.ItemIndicator>
                  <Check size={16} className="text-primary" />
                </RadixSelect.ItemIndicator>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}
