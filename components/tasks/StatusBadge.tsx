import { Badge } from "@/components/ui/badge";
import {
  TASK_STATUS_LABELS,
  TASK_STATUS_COLORS,
  PRIORITY_LABELS,
  PRIORITY_COLORS,
  type TaskStatus,
  type Priority,
} from "@/lib/constants";

export function StatusBadge({ status }: { status: TaskStatus }) {
  return <Badge tone={TASK_STATUS_COLORS[status]}>{TASK_STATUS_LABELS[status]}</Badge>;
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <Badge tone={PRIORITY_COLORS[priority]}>{PRIORITY_LABELS[priority]}</Badge>;
}
