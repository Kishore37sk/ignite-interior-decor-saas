import { ChevronDown, ChevronsUp, ChevronUp, Equal, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PRIORITY_LABELS, PRIORITY_TONES } from "@/lib/constants";
import type { PriorityLevel } from "@/types/database";

const ICONS: Record<PriorityLevel, LucideIcon> = {
  low: ChevronDown,
  medium: Equal,
  high: ChevronUp,
  urgent: ChevronsUp,
};

export type PriorityBadgeProps = {
  value: PriorityLevel;
  size?: "sm" | "md" | "lg";
  className?: string;
};

/** Priority chip (soft tints, so it never competes with the status pill). */
export function PriorityBadge({ value, size, className }: PriorityBadgeProps) {
  const Icon = ICONS[value];
  return (
    <Badge tone={PRIORITY_TONES[value]} appearance="soft" size={size} className={className}>
      <Icon aria-hidden="true" strokeWidth={2.5} />
      {PRIORITY_LABELS[value]}
      <span className="sr-only"> priority</span>
    </Badge>
  );
}
