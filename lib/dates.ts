import { format, formatDistanceToNow, isAfter, isBefore, addDays, startOfDay } from "date-fns";
import { cs } from "date-fns/locale";

export function formatDate(timestamp: number | undefined, fmt = "d. M. yyyy"): string {
  if (!timestamp) return "—";
  return format(new Date(timestamp), fmt, { locale: cs });
}

export function formatDateTime(timestamp: number | undefined): string {
  if (!timestamp) return "—";
  return format(new Date(timestamp), "d. M. yyyy HH:mm", { locale: cs });
}

export function relativeTime(timestamp: number): string {
  return formatDistanceToNow(new Date(timestamp), { locale: cs, addSuffix: true });
}

export function isOverdue(deadline: number | undefined): boolean {
  if (!deadline) return false;
  return isBefore(deadline, startOfDay(new Date()));
}

export function isDeadlineSoon(deadline: number | undefined, days = 7): boolean {
  if (!deadline) return false;
  const now = new Date();
  const threshold = addDays(startOfDay(now), days);
  return isAfter(deadline, now) && isBefore(deadline, threshold);
}

export function toDateInputValue(timestamp: number | undefined): string {
  if (!timestamp) return "";
  return format(new Date(timestamp), "yyyy-MM-dd");
}

export function fromDateInputValue(value: string): number | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (isNaN(d.getTime())) return undefined;
  return d.getTime();
}
