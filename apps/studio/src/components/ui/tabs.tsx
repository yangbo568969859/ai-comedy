"use client";

import { Tabs as TabsPrimitive } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

export type TabItem = { value: string; label: ReactNode; content: ReactNode; disabled?: boolean };
export type TabsProps = { value: string; onValueChange: (value: string) => void; items: TabItem[]; className?: string };

export function Tabs({ value, onValueChange, items, className }: TabsProps) {
  return (
    <TabsPrimitive.Root className={cn("min-w-0", className)} value={value} onValueChange={onValueChange}>
      <TabsPrimitive.List aria-label="内容标签页" className="flex min-w-0 gap-1 border-b border-border">
        {items.map((item) => <TabsPrimitive.Trigger className="inline-flex h-9 shrink-0 items-center border-b-2 border-transparent px-2 text-sm font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=active]:border-primary data-[state=active]:text-foreground" disabled={item.disabled} key={item.value} value={item.value}>{item.label}</TabsPrimitive.Trigger>)}
      </TabsPrimitive.List>
      {items.map((item) => <TabsPrimitive.Content className="pt-4 outline-none" key={item.value} value={item.value}>{item.content}</TabsPrimitive.Content>)}
    </TabsPrimitive.Root>
  );
}
