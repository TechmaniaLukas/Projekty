import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Česká plurálizace: pluralize(n, "projekt", "projekty", "projektů") */
export function pluralize(
  n: number,
  one: string,
  few: string,
  many: string,
): string {
  if (n === 1) return `${n} ${one}`;
  if (n >= 2 && n <= 4) return `${n} ${few}`;
  return `${n} ${many}`;
}
