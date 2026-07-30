import Image from "next/image";
import { cn, getInitials } from "@/lib/utils";

interface AvatarProps {
  src?: string | null;
  name: string;
  size?: number;
  className?: string;
  showOnline?: boolean;
  online?: boolean;
}

const AVATAR_COLORS = [
  "bg-blue-500",
  "bg-purple-500",
  "bg-green-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-teal-500",
  "bg-indigo-500",
  "bg-orange-500",
];

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function Avatar({
  src,
  name,
  size = 40,
  className,
  showOnline = false,
  online = false,
}: AvatarProps) {
  const initials = getInitials(name);
  const colorClass = avatarColor(name);

  return (
    <div
      className={cn("relative inline-flex shrink-0", className)}
      style={{ width: size, height: size }}
    >
      {src ? (
        <Image
          src={src}
          alt={name}
          width={size}
          height={size}
          className="rounded-full object-cover"
          style={{ width: size, height: size }}
        />
      ) : (
        <div
          className={cn(
            "flex items-center justify-center rounded-full text-white font-semibold select-none",
            colorClass
          )}
          style={{ width: size, height: size, fontSize: size * 0.36 }}
        >
          {initials}
        </div>
      )}

      {showOnline && (
        <span
          className={cn(
            "absolute bottom-0 right-0 block rounded-full ring-2 ring-white",
            online ? "bg-green-500" : "bg-gray-400"
          )}
          style={{ width: size * 0.28, height: size * 0.28 }}
          aria-label={online ? "Online" : "Offline"}
        />
      )}
    </div>
  );
}
