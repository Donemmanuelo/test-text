import { cn } from "@/lib/utils";

interface PresenceBadgeProps {
  online: boolean;
  className?: string;
  showText?: boolean;
  lastSeenText?: string;
}

export function PresenceBadge({
  online,
  className,
  showText = false,
  lastSeenText,
}: PresenceBadgeProps) {
  if (showText) {
    return (
      <span
        className={cn(
          "text-xs",
          online ? "text-green-600" : "text-gray-400",
          className
        )}
      >
        {online ? "online" : lastSeenText ?? "offline"}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-block rounded-full",
        online ? "bg-green-500" : "bg-gray-300",
        className
      )}
      style={{ width: 8, height: 8 }}
      aria-label={online ? "Online" : "Offline"}
    />
  );
}
