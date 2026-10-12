import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

type BadgeVariant = "neutral" | "success" | "warning" | "danger" | "info";
export type BadgeProps = HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant };

const variantClasses: Record<BadgeVariant, string> = {
  neutral: "bg-surface-muted text-muted-foreground", success: "bg-success-surface text-success",
  warning: "bg-warning-surface text-warning", danger: "bg-danger-surface text-danger", info: "bg-info-surface text-info",
};

export function Badge({ className, variant = "neutral", ...props }: BadgeProps) {
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", variantClasses[variant], className)} {...props} />;
}
