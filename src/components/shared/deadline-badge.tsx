import {
  AlarmClock,
  Ban,
  CalendarCheck,
  CalendarClock,
  CalendarX,
  CircleCheck,
  Hourglass,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DEADLINE_STATE_TONES, type Tone } from "@/lib/constants";
import { deadlineInfo } from "@/lib/dates";
import type { DeadlineState, ProjectStatus } from "@/types/database";

const ICONS: Record<DeadlineState, LucideIcon> = {
  completed: CircleCheck,
  cancelled: Ban,
  no_date: CalendarX,
  overdue: TriangleAlert,
  due_today: AlarmClock,
  due_tomorrow: AlarmClock,
  due_7: Hourglass,
  due_14: CalendarClock,
  due_30: CalendarClock,
  on_track: CalendarCheck,
};

export type DeadlineBadgeProps = (
  | {
      /** Deadline (`YYYY-MM-DD`), usually `project_directory.deadline_date`. */
      deadline: string | null | undefined;
      status: ProjectStatus;
    }
  | {
      /** Pre-computed state + label (e.g. from `deadlineInfo`). */
      state: DeadlineState;
      label: string;
      tone?: Tone;
    }
) & {
  size?: "sm" | "md" | "lg";
  className?: string;
};

/** Days-remaining / overdue indicator for project deadlines (derived, independent of status). */
export function DeadlineBadge(props: DeadlineBadgeProps) {
  const info =
    "state" in props
      ? { state: props.state, label: props.label, tone: props.tone ?? DEADLINE_STATE_TONES[props.state] }
      : deadlineInfo(props.deadline ?? null, props.status);
  const Icon = ICONS[info.state];

  return (
    <Badge tone={info.tone} appearance="soft" size={props.size} className={props.className}>
      <Icon aria-hidden="true" />
      {info.label}
    </Badge>
  );
}
