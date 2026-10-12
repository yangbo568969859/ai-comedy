import { Slot } from "radix-ui";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "icon";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  asChild?: boolean;
  children: ReactNode;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary: "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
  secondary: "border-border-strong bg-surface text-foreground hover:bg-surface-muted",
  ghost: "border-transparent bg-transparent text-muted-foreground hover:bg-surface-muted hover:text-foreground",
  danger: "border-danger bg-danger text-primary-foreground hover:bg-danger/90",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 px-2.5 text-xs",
  md: "h-9 gap-2 px-3 text-sm",
  icon: "size-9 p-0",
};

export function Button({ className, variant = "primary", size = "md", asChild = false, type, ...props }: ButtonProps) {
  const Component = asChild ? Slot.Root : "button";

  return (
    <Component
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md border font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
        variantClasses[variant], sizeClasses[size], className,
      )}
      {...(!asChild ? { type: type ?? "button" } : {})}
      {...props}
    />
  );
}
