import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, isToday, isYesterday, formatDistanceToNow } from "date-fns";

/**
 * Merge Tailwind CSS class names, resolving conflicts.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Format a message timestamp for display inside a bubble.
 * Shows time only (e.g. "14:32").
 */
export function formatMessageTime(dateString: string): string {
  try {
    return format(new Date(dateString), "HH:mm");
  } catch {
    return "";
  }
}

/**
 * Format a date for the date separator between message groups.
 * Today → "Today", Yesterday → "Yesterday", else "MMM d, yyyy".
 */
export function formatDateSeparator(dateString: string): string {
  try {
    const date = new Date(dateString);
    if (isToday(date)) return "Today";
    if (isYesterday(date)) return "Yesterday";
    return format(date, "MMMM d, yyyy");
  } catch {
    return "";
  }
}

/**
 * Format a sidebar room preview timestamp.
 * Same day → time, within a week → weekday, older → date.
 */
export function formatRoomTime(dateString: string | null | undefined): string {
  if (!dateString) return "";
  try {
    const date = new Date(dateString);
    if (isToday(date)) return format(date, "HH:mm");
    if (isYesterday(date)) return "Yesterday";
    return format(date, "dd/MM/yyyy");
  } catch {
    return "";
  }
}

/**
 * Format last seen time for presence display.
 */
export function formatLastSeen(dateString: string | null | undefined): string {
  if (!dateString) return "Unknown";
  try {
    const date = new Date(dateString);
    if (isToday(date)) {
      return `last seen today at ${format(date, "HH:mm")}`;
    }
    if (isYesterday(date)) {
      return `last seen yesterday at ${format(date, "HH:mm")}`;
    }
    return `last seen ${formatDistanceToNow(date, { addSuffix: true })}`;
  } catch {
    return "Unknown";
  }
}

/**
 * Truncate a string at the given max length, adding an ellipsis if needed.
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 1) + "…";
}

/**
 * Get initials from a display name (up to 2 characters).
 */
export function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

/**
 * Determine if two ISO date strings fall on the same calendar day.
 */
export function isSameDay(a: string, b: string): boolean {
  try {
    const da = new Date(a);
    const db = new Date(b);
    return (
      da.getFullYear() === db.getFullYear() &&
      da.getMonth() === db.getMonth() &&
      da.getDate() === db.getDate()
    );
  } catch {
    return false;
  }
}
