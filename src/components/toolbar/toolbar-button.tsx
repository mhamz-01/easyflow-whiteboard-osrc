"use client";

// Reusable icon button with a hover tooltip — used by the whiteboard toolbar for every drawing tool entry.

import React from "react";
import { LucideIcon } from "lucide-react";
import { cn } from "../../lib/utils";

interface ToolButtonProps {
  icon: LucideIcon;
  label: string;
  isActive: boolean;
  onClick: () => void;
  disabled?: boolean;
  shortcut?: string;
}

export default function ToolButton({
  icon: Icon,
  label,
  isActive,
  onClick,
  disabled = false,
  shortcut,
}: ToolButtonProps) {
  return (
    <div className="group/tooltip relative">
      <button
        onClick={onClick}
        disabled={disabled}
        className={cn(
          "relative flex items-center justify-center",
          "w-10 h-10 rounded-xl",
          "transition-all duration-200 ease-out",
          "focus-visible:outline-none focus-visible:ring-2",
          "focus-visible:ring-blue-500 focus-visible:ring-offset-2",
          "active:scale-95",
          "disabled:opacity-40 disabled:cursor-not-allowed",
          isActive
            ? "bg-[var(--wb-tool-active)] text-white shadow-sm"
            : "text-white hover:bg-gray-100 hover:text-gray-900"
        )}
        aria-label={label}
        aria-pressed={isActive}
        type="button"
      >
        <Icon
          size={20}
          strokeWidth={2}
          className="transition-transform duration-200 group-hover:scale-110"
        />
      </button>

      {/* Tooltip */}
      <div
        className={cn(
          "absolute -top-11 left-1/2 -translate-x-1/2",
          "px-2 py-1.5 bg-gray-900 text-white rounded-md",
          "opacity-0 group-hover/tooltip:opacity-100",
          "transition-opacity duration-200",
          "pointer-events-none whitespace-nowrap z-[60]",
          "text-xs font-medium",
          "after:content-[''] after:absolute after:top-0 after:left-1/2",
          "after:-translate-x-1/2 after:-translate-y-full",
          "after:border-4 after:border-transparent after:border-b-gray-900"
        )}
      >
        <span>{label}</span>
        {shortcut && (
          <span className="ml-2 opacity-70 text-[10px]">{shortcut}</span>
        )}
      </div>
    </div>
  );
}