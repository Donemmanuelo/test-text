"use client";

import { cn } from "@/lib/utils";

interface ToggleProps {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description?: string;
}

export function Toggle({ checked, onChange, label, description }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="w-full flex items-center justify-between gap-4 text-left"
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-gray-900">{label}</span>
        {description && (
          <span className="block text-xs text-gray-400 mt-0.5">{description}</span>
        )}
      </span>
      <span
        className={cn(
          "shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
          checked ? "bg-[#25d366]" : "bg-gray-200"
        )}
      >
        <span
          className={cn(
            "inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-[22px]" : "translate-x-[3px]"
          )}
        />
      </span>
    </button>
  );
}
