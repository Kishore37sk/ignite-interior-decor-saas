import { AlarmClock, CalendarClock, CircleCheck, CircleSlash, Hourglass, TriangleAlert, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { REQUIRED_STATE_TONES, type Tone } from "@/lib/constants";
import { requiredDateInfo } from "@/lib/dates";
import type { MaterialRequestStatus, RequiredState } from "@/types/database";

const ICONS: Record<RequiredState, LucideIcon> = {
  closed: CircleSlash,
  overdue: TriangleAlert,
  due_today: AlarmClock,
  due_tomorrow: AlarmClock,
  due_soon: Hourglass,
  upcoming: CalendarClock,
};

export type RequiredDateBadgeProps = (
  | { requiredDate: string | null | undefined; status: MaterialRequestStatus }
  | { state: RequiredState; label: string; tone?: Tone }
) & {
  size?: "sm" | "md" | "lg";
  className?: string;
};

/** "Required in 7 days" / "Due today" / "Overdue by 2 days" / "Delivered" for material requests. */
export function RequiredDateBadge(props: RequiredDateBadgeProps) {
  const info =
    "state" in props
      ? { state: props.state, label: props.label, tone: props.tone ?? REQUIRED_STATE_TONES[props.state] }
      : requiredDateInfo(props.requiredDate ?? null, props.status);
  const delivered = "status" in props && props.status === "delivered";
  const Icon = delivered ? CircleCheck : ICONS[info.state];

  return (
    <Badge tone={info.tone} appearance="soft" size={props.size} className={props.className}>
      <Icon aria-hidden="true" />
      {info.label}
    </Badge>
  );
}
