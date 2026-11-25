"use client";

// Vertical divider used to visually separate groups of buttons in the whiteboard toolbar.

import React from "react";
interface ToolbarSeparatorProps {
  className?: string;
}

export default function ToolbarSeparator({
  className = "",
}: ToolbarSeparatorProps) {
  return (
    <div
      className={`w-px h-6 bg-gray-200 mx-1 ${className}`}
      role="separator"
      aria-orientation="vertical"
    />
  );
}