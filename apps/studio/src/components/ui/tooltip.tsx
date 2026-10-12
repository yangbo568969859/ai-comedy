"use client";

import { Tooltip as TooltipPrimitive } from "radix-ui";
import type { ReactNode } from "react";

export type TooltipProps = { content: ReactNode; children: ReactNode };
export function Tooltip({ content, children }: TooltipProps) {
  return (
    <TooltipPrimitive.Provider delayDuration={300}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal><TooltipPrimitive.Content className="z-50 max-w-64 rounded-md bg-foreground px-2 py-1 text-xs text-primary-foreground shadow-panel" sideOffset={6}>
          {content}<TooltipPrimitive.Arrow className="fill-foreground" />
        </TooltipPrimitive.Content></TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
