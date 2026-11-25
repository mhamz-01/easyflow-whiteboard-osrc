"use client";

// Pen tool options panel — controls stroke color presets, stroke width presets + slider, and dash style (solid/dashed/dotted).

import { useWhiteboardStore } from "../../../store/whiteboard-store";
import { cn } from "../../../lib/utils";
import { Minus } from "lucide-react";
import { INK } from "../../../lib/design-tokens";

const PRESET_COLORS = [
  "#FFFFFF",
  "#DC2626",
  "#EA580C",
  "#CA8A04",
  "#16A34A",
  "#2563EB",
  "#7C3AED",
  "#DB2777",
];

const PRESET_WIDTHS = [1, 2, 4, 8, 12];

// Stroke styles for pen
const STROKE_STYLES = [
  { id: "solid", label: "Solid", dashArray: null },
  { id: "dashed", label: "Dashed", dashArray: [2, 2] },
  { id: "dotted", label: "Dotted", dashArray: [0.5, 2] },
];

export default function PenOptions() {
  // The white swatch becomes the theme's ink, so the default colour is always a visible preset.
  const theme = useWhiteboardStore((s) => s.theme);
  const presets = PRESET_COLORS.map((c) => (c === "#FFFFFF" ? INK[theme] : c));
  const toolOptions = useWhiteboardStore((state) => state.toolOptions);
  const setToolOption = useWhiteboardStore((state) => state.setToolOption);

  const { color, strokeWidth, opacity, strokeDashArray } = toolOptions.pen;

  const isPresetColor = presets.includes(color);
  
  // Determine active stroke style
  const activeStrokeStyle = STROKE_STYLES.find(style => {
    if (!style.dashArray && !strokeDashArray) return true;
    if (style.dashArray && strokeDashArray && 
        style.dashArray[0] === strokeDashArray[0] && 
        style.dashArray[1] === strokeDashArray[1]) return true;
    return false;
  })?.id || "solid";

  return (
    <div className="space-y-6 text-neutral-200 overflow-hidden">
      {/* Section title */}
      <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
        Pen settings
      </p>

      {/* STROKE STYLE (NEW) */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-neutral-300">Stroke style</label>
        
        <div className="flex gap-2">
          {STROKE_STYLES.map((style) => {
            const isActive = activeStrokeStyle === style.id;
            
            return (
              <button
                key={style.id}
                onClick={() => setToolOption("pen", "strokeDashArray", style.dashArray)}
                className={cn(
                  "flex-1 h-10 rounded-lg border transition-colors duration-150 flex flex-col items-center justify-center gap-1",
                  isActive
                    ? "bg-neutral-700 border-neutral-500 text-white"
                    : "bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800"
                )}
                title={style.label}
              >
                {/* Visual representation of line style */}
                <div className="w-8 h-[2px] relative">
                  {style.id === "solid" && (
                    <div className="absolute inset-0 bg-current" />
                  )}
                  {style.id === "dashed" && (
                    <svg width="32" height="2" viewBox="0 0 32 2" className="absolute inset-0">
                      <line x1="0" y1="1" x2="32" y2="1" stroke="currentColor" strokeWidth="2" strokeDasharray="10 5" />
                    </svg>
                  )}
                  {style.id === "dotted" && (
                    <svg width="32" height="2" viewBox="0 0 32 2" className="absolute inset-0">
                      <line x1="0" y1="1" x2="32" y2="1" stroke="currentColor" strokeWidth="2" strokeDasharray="2 4" />
                    </svg>
                  )}
                </div>
                <span className="text-[10px] font-medium">{style.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* COLOR */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-neutral-300">Color</label>

        <div className="flex items-center gap-3 overflow-visible pr-1">
          {/* Preset colors */}
          <div className="flex flex-wrap gap-2 overflow-visible">
            {presets.map((preset) => {
              const isActive = color === preset;
              return (
                <button
                  key={preset}
                  onClick={() => setToolOption("pen", "color", preset)}
                  className={cn(
                    "h-7 w-7 rounded-md border transition-colors duration-150",
                    isActive
                      ? "border-neutral-200 outline outline-2 outline-neutral-400"
                      : "border-neutral-700 hover:border-neutral-500"
                  )}
                  style={{ backgroundColor: preset }}
                  aria-label={`Color ${preset}`}
                />
              );
            })}
          </div>

          {/* Custom color picker */}
          {/* <div className="relative overflow-visible">
            <label
              className={cn(
                "relative h-7 w-7 rounded-md cursor-pointer border bg-neutral-900 flex items-center justify-center transition-colors duration-150",
                isPresetColor
                  ? "border-neutral-700 hover:border-neutral-500"
                  : "border-neutral-200 outline outline-2 outline-neutral-400"
              )}
              title="Custom color"
            >
              <div
                className="absolute inset-0 rounded-md opacity-30"
                style={{
                  backgroundImage:
                    "linear-gradient(45deg,#444 25%,transparent 25%),linear-gradient(-45deg,#444 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#444 75%),linear-gradient(-45deg,transparent 75%,#444 75%)",
                  backgroundSize: "6px 6px",
                  backgroundPosition: "0 0,0 3px,3px -3px,-3px 0px",
                }}
              />
              <div
                className="relative z-10 h-4 w-4 rounded-sm border border-neutral-800"
                style={{ backgroundColor: color }}
              />
              <input
                type="color"
                value={color}
                onChange={(e) => setToolOption("pen", "color", e.target.value)}
                className="absolute inset-0 opacity-0 cursor-pointer"
                aria-label="Custom color"
              />
            </label>
          </div> */}
        </div>
      </div>

      {/* STROKE WIDTH */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-neutral-300">
            Stroke width
          </label>
          <span className="text-xs font-semibold text-neutral-100">
            {strokeWidth}px
          </span>
        </div>

        <div className="flex gap-2">
          {PRESET_WIDTHS.map((width) => {
            const isActive = strokeWidth === width;
            return (
              <button
                key={width}
                onClick={() => setToolOption("pen", "strokeWidth", width)}
                className={cn(
                  "flex-1 h-8 rounded-lg border text-xs font-medium transition-colors duration-150",
                  isActive
                    ? "bg-neutral-700 border-neutral-500 text-white"
                    : "bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800"
                )}
              >
                {width}
              </button>
            );
          })}
        </div>

        <input
          type="range"
          min={1}
          max={20}
          step={1}
          value={strokeWidth}
          onChange={(e) => setToolOption("pen", "strokeWidth", Number(e.target.value))}
          className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-neutral-800 accent-neutral-200"
        />
      </div>

      {/* OPACITY */}
      {/* <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-neutral-300">Opacity</label>
          <span className="text-xs font-semibold text-neutral-100">
            {Math.round(opacity * 100)}%
          </span>
        </div>

        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={opacity}
          onChange={(e) => setToolOption("pen", "opacity", Number(e.target.value))}
          className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-neutral-800 accent-neutral-200"
        />
      </div> */}
    </div>
  );
}