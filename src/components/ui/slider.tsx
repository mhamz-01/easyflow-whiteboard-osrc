"use client";

// Minimal range slider — a native <input type="range"> under a styled track and thumb. No dependencies.

import * as React from "react";

interface SliderProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onValueChange: (value: number) => void;
  className?: string;
  "aria-label"?: string;
}

export function Slider({ value, min = 0, max = 100, step = 1, onValueChange, className = "", ...aria }: SliderProps) {
  const pct = max === min ? 0 : ((value - min) / (max - min)) * 100;

  return (
    <div className={`relative flex w-full h-4 touch-none items-center select-none ${className}`}>
      <div className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-neutral-700">
        <div className="absolute h-full bg-neutral-300" style={{ width: `${pct}%` }} />
      </div>
      <div
        className="pointer-events-none absolute size-4 rounded-full border border-neutral-300 bg-white shadow-sm"
        style={{ left: `calc(${pct}% - ${(pct / 100) * 16}px)` }}
      />
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onValueChange(Number(e.target.value))}
        className="absolute inset-0 w-full cursor-pointer opacity-0"
        {...aria}
      />
    </div>
  );
}
