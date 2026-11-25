"use client";

// Line tool options panel — stroke color, stroke width, and dash style for the line drawing tool.

import { useWhiteboardStore } from "../../../store/whiteboard-store";
import { cn } from "../../../lib/utils";
import { INK } from "../../../lib/design-tokens";

const PRESET_COLORS = [
  "#FFFFFF", // White
  "#000000", // Black
  "#DC2626", // Red
  "#EA580C", // Orange
  "#CA8A04", // Yellow
  "#16A34A", // Green
  "#2563EB", // Blue
  "#7C3AED", // Purple
  "#DB2777", // Pink
];

const STROKE_STYLES = [
  { id: "solid", label: "Solid", dashArray: null },
  { id: "dashed", label: "Dashed", dashArray: [10, 5] },
  { id: "dotted", label: "Dotted", dashArray: [2, 4] },
];

export default function LineOptions() {
  // The white swatch becomes the theme's ink, so the default colour is always a visible preset.
  const theme = useWhiteboardStore((s) => s.theme);
  const presets = PRESET_COLORS.map((c) => (c === "#FFFFFF" ? INK[theme] : c));
  const toolOptions = useWhiteboardStore((state) => state.toolOptions);
  
  const setToolOption = useWhiteboardStore((state) => state.setToolOption);

  const { strokeColor, strokeWidth, strokeDashArray } = toolOptions.line;

  const isPresetColor = presets.includes(strokeColor);
  
  const activeStrokeStyle = STROKE_STYLES.find(style => {
    if (!style.dashArray && !strokeDashArray) return true;
    if (style.dashArray && strokeDashArray && 
        style.dashArray[0] === strokeDashArray[0] && 
        style.dashArray[1] === strokeDashArray[1]) return true;
    return false;
  })?.id || "solid";

  return (
    <div className="space-y-6 text-neutral-200">
      {/* Section title */}
      <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
        Line Settings
      </p>

      {/* Stroke Style */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-neutral-300">Line Style</label>
        
        <div className="flex gap-2">
          {STROKE_STYLES.map((style) => {
            const isActive = activeStrokeStyle === style.id;
            
            return (
              <button
                key={style.id}
                onClick={() => setToolOption("line", "strokeDashArray", style.dashArray)}
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

      {/* Stroke Color */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-neutral-300">Color</label>
        
        <div className="flex items-center gap-3 overflow-visible pr-1">
          {/* Preset colors */}
          <div className="flex flex-wrap gap-2 overflow-visible">
            {presets.map((preset) => {
              const isActive = strokeColor === preset;
              return (
                <button
                  key={preset}
                  onClick={() => setToolOption("line", "strokeColor", preset)}
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
                style={{ backgroundColor: strokeColor }}
              />
              <input
                type="color"
                value={strokeColor}
                onChange={(e) => setToolOption("line", "strokeColor", e.target.value)}
                className="absolute inset-0 opacity-0 cursor-pointer"
                aria-label="Custom color"
              />
            </label>
          </div> */}
        </div>
      </div>

      {/* Stroke Width */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-neutral-300">Stroke Width</label>
          <span className="text-xs font-semibold text-neutral-100">{strokeWidth}px</span>
        </div>
        <input
          type="range"
          min={1}
          max={10}
          step={1}
          value={strokeWidth}
          onChange={(e) => setToolOption("line", "strokeWidth", parseInt(e.target.value))}
          className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-neutral-800 accent-neutral-200"
        />
      </div>

      {/* Usage hint */}
      <div className="p-3 bg-neutral-900 border border-neutral-800 rounded-lg">
        <p className="text-[11px] text-neutral-400 leading-relaxed">
          <strong className="text-neutral-300">Tip:</strong> Click and drag to draw a line. The line follows your cursor until you release.
        </p>
      </div>
    </div>
  );
}