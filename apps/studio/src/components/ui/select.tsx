"use client";

import { Check, ChevronDown } from "lucide-react";
import { Select as SelectPrimitive } from "radix-ui";

import { cn } from "../../lib/utils";

export type SelectItem = {
  value: string;
  label: string;
  disabled?: boolean;
};

export type SelectProps = {
  value: string;
  onValueChange: (value: string) => void;
  items: readonly SelectItem[];
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
};

export function Select({ value, onValueChange, items, ariaLabel, className, disabled = false }: SelectProps) {
  return (
    <SelectPrimitive.Root disabled={disabled} value={value} onValueChange={onValueChange}>
      <SelectPrimitive.Trigger
        aria-label={ariaLabel}
        className={cn(
          "group inline-flex h-8 min-w-24 shrink-0 items-center justify-between gap-2 rounded-md border border-border bg-surface px-2.5 text-xs font-medium text-foreground outline-none transition-[border-color,background-color,box-shadow] hover:border-border-strong hover:bg-surface-muted data-[state=open]:border-primary data-[state=open]:bg-surface-muted focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-focus-ring disabled:pointer-events-none disabled:opacity-50",
          className,
        )}
      >
        <SelectPrimitive.Value />
        <SelectPrimitive.Icon className="text-muted-foreground transition-transform duration-150 group-data-[state=open]:rotate-180">
          <ChevronDown aria-hidden="true" size={14} />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          align="end"
          className="z-[100] min-w-[var(--radix-select-trigger-width)] max-h-[var(--radix-select-content-available-height)] overflow-hidden rounded-md border border-border bg-surface p-1 text-foreground shadow-panel"
          collisionPadding={8}
          position="popper"
          side="bottom"
          sideOffset={6}
        >
          <SelectPrimitive.Viewport className="min-w-[var(--radix-select-trigger-width)]">
            {items.map((item) => (
              <SelectPrimitive.Item
                className="relative flex h-8 cursor-default select-none items-center rounded px-7 pr-3 text-xs outline-none transition-colors data-[highlighted]:bg-surface-selected data-[highlighted]:text-foreground data-[state=checked]:font-medium data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                key={item.value}
                value={item.value}
                {...(item.disabled ? { disabled: true } : {})}
              >
                <span className="absolute left-2 inline-flex size-4 items-center justify-center text-primary">
                  <SelectPrimitive.ItemIndicator>
                    <Check aria-hidden="true" size={14} strokeWidth={2.5} />
                  </SelectPrimitive.ItemIndicator>
                </span>
                <SelectPrimitive.ItemText>{item.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
