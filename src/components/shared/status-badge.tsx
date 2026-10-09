import { CircleCheck } from "lucide-react";
import { Badge, type BadgeAppearance } from "@/components/ui/badge";
import {
  MATERIAL_REQUEST_STATUS_LABELS,
  MATERIAL_REQUEST_STATUS_TONES,
  MILESTONE_STATUS_LABELS,
  MILESTONE_STATUS_TONES,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_TONES,
  USER_STATUS_LABELS,
  USER_STATUS_TONES,
  type Tone,
} from "@/lib/constants";
import { humanize } from "@/lib/format";
import type { MaterialRequestStatus, MilestoneStatus, ProjectStatus, UserStatus } from "@/types/database";

export type StatusBadgeProps = (
  | { kind: "project"; value: ProjectStatus }
  | { kind: "material"; value: MaterialRequestStatus }
  | { kind: "milestone"; value: MilestoneStatus }
  | { kind: "user"; value: UserStatus }
) & {
  size?: "sm" | "md" | "lg";
  appearance?: BadgeAppearance;
  className?: string;
};

function resolve(props: StatusBadgeProps): { label: string; tone: Tone } {
  switch (props.kind) {
    case "project":
      return { label: PROJECT_STATUS_LABELS[props.value], tone: PROJECT_STATUS_TONES[props.value] };
    case "material":
      return {
        label: MATERIAL_REQUEST_STATUS_LABELS[props.value],
        tone: MATERIAL_REQUEST_STATUS_TONES[props.value],
      };
    case "milestone":
      return { label: MILESTONE_STATUS_LABELS[props.value], tone: MILESTONE_STATUS_TONES[props.value] };
    case "user":
      return { label: USER_STATUS_LABELS[props.value], tone: USER_STATUS_TONES[props.value] };
  }
}

/** Filled status pill for project / material request / milestone / user statuses. */
export function StatusBadge(props: StatusBadgeProps) {
  const resolved = resolve(props);
  const label = resolved.label ?? humanize(props.value);
  const tone: Tone = resolved.tone ?? "muted";
  const done = props.value === "completed" || props.value === "delivered";

  return (
    <Badge tone={tone} size={props.size} appearance={props.appearance} className={props.className}>
      {done ? <CircleCheck aria-hidden="true" /> : null}
      {label}
    </Badge>
  );
}
