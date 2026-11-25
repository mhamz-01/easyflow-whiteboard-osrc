"use client";

// Arrow tool options panel — stroke color, stroke width, and dash style for the arrow drawing tool.

import { useWhiteboardStore } from "../../../store/whiteboard-store";
import { cn } from "../../../lib/utils";
import { useEffect, useState, RefObject } from "react";
import { Canvas } from "fabric";
import { Arrow } from "../../../lib/fabric-arrow";
import { BidirectionalArrow } from "../../../lib/fabric-bidirectional-arrow";
import { INK } from "../../../lib/design-tokens";

const PRESET_COLORS = [
  "#FFFFFF", "#000000", "#DC2626", "#EA580C",
  "#CA8A04", "#16A34A", "#2563EB", "#7C3AED", "#DB2777",
];

const STROKE_STYLES = [
  { id: "solid", label: "Solid", dashArray: null },
  { id: "dashed", label: "Dashed", dashArray: [10, 5] },
  { id: "dotted", label: "Dotted", dashArray: [2, 4] },
];

interface ArrowOptionsProps {
  fabricCanvas?: RefObject<Canvas | null>;
}

export default function ArrowOptions({ fabricCanvas }: ArrowOptionsProps) {
  // The white swatch becomes the theme's ink, so the default colour is always a visible preset.
  const theme = useWhiteboardStore((s) => s.theme);
  const presets = PRESET_COLORS.map((c) => (c === "#FFFFFF" ? INK[theme] : c));
  const toolOptions = useWhiteboardStore((state) => state.toolOptions);
  const setToolOption = useWhiteboardStore((state) => state.setToolOption);

  const { strokeColor, strokeWidth, strokeDashArray } = toolOptions.arrow;
  const [isBidirectional, setIsBidirectional] = useState(false);

  const isPresetColor = presets.includes(strokeColor);
  
  const activeStrokeStyle = STROKE_STYLES.find(style => {
    if (!style.dashArray && !strokeDashArray) return true;
    if (style.dashArray && strokeDashArray && 
        style.dashArray[0] === strokeDashArray[0] && 
        style.dashArray[1] === strokeDashArray[1]) return true;
    return false;
  })?.id || "solid";

  // Detect if selected object is bidirectional
  useEffect(() => {
    const canvas = fabricCanvas?.current;
    if (!canvas) return;

    const handleSelection = () => {
      const activeObj = canvas.getActiveObject();
      if (activeObj) {
        setIsBidirectional(activeObj.type === "bidirectional-arrow");
      }
    };

    canvas.on("selection:created", handleSelection);
    canvas.on("selection:updated", handleSelection);
    canvas.on("selection:cleared", () => setIsBidirectional(false));

    return () => {
      canvas.off("selection:created", handleSelection);
      canvas.off("selection:updated", handleSelection);
      canvas.off("selection:cleared", () => setIsBidirectional(false));
    };
  }, [fabricCanvas]);

  // Toggle between Arrow and BidirectionalArrow
  const handleBidirectionalToggle = (bidirectional: boolean) => {
    const canvas = fabricCanvas?.current;
    if (!canvas) return;

    const activeObj = canvas.getActiveObject();
    if (!activeObj || (activeObj.type !== "arrow" && activeObj.type !== "bidirectional-arrow")) return;

    // Get current properties
    const props = {
      stroke: (activeObj as any).stroke,
      strokeWidth: (activeObj as any).strokeWidth,
      strokeDashArray: (activeObj as any).strokeDashArray,
      left: activeObj.left,
      top: activeObj.top,
      angle: activeObj.angle,
      scaleX: activeObj.scaleX,
      scaleY: activeObj.scaleY,
    };

    // Get line points
    const points: [number, number, number, number] = [
      (activeObj as any).x1,
      (activeObj as any).y1,
      (activeObj as any).x2,
      (activeObj as any).y2,
    ];

    // Remove old arrow
    canvas.remove(activeObj);

    // Create new arrow of the desired type
    let newArrow;
    if (bidirectional) {
      newArrow = new BidirectionalArrow(points, props);
    } else {
      newArrow = new Arrow(points, props);
    }

    // Add to canvas and select it
    canvas.add(newArrow as any);
    canvas.setActiveObject(newArrow as any);
    canvas.renderAll();

    setIsBidirectional(bidirectional);
  };

  return (
    <div className="space-y-6 text-neutral-200">
      <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
        Arrow Settings
      </p>

      {/* Arrow Direction Toggle */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-neutral-300">Direction</label>
        <div className="flex gap-2">
          <button
            onClick={() => handleBidirectionalToggle(false)}
            className={cn(
              "flex-1 h-10 rounded-lg border transition-colors duration-150 flex items-center justify-center gap-2",
              !isBidirectional
                ? "bg-neutral-700 border-neutral-500 text-white"
                : "bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800"
            )}
          >
            <span className="text-lg">→</span>
            <span className="text-xs font-medium">One-way</span>
          </button>
          <button
            onClick={() => handleBidirectionalToggle(true)}
            className={cn(
              "flex-1 h-10 rounded-lg border transition-colors duration-150 flex items-center justify-center gap-2",
              isBidirectional
                ? "bg-neutral-700 border-neutral-500 text-white"
                : "bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800"
            )}
          >
            <span className="text-lg">↔</span>
            <span className="text-xs font-medium">Two-way</span>
          </button>
        </div>
      </div>

      {/* Stroke Style */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-neutral-300">Line Style</label>
        <div className="flex gap-2">
          {STROKE_STYLES.map((style) => {
            const isActive = activeStrokeStyle === style.id;
            return (
              <button
                key={style.id}
                onClick={() => setToolOption("arrow", "strokeDashArray", style.dashArray)}
                className={cn(
                  "flex-1 h-10 rounded-lg border transition-colors duration-150 flex flex-col items-center justify-center gap-1",
                  isActive
                    ? "bg-neutral-700 border-neutral-500 text-white"
                    : "bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800"
                )}
              >
                <div className="w-8 h-[2px] relative">
                  {style.id === "solid" && <div className="absolute inset-0 bg-current" />}
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

      {/* Color */}
      <div className="space-y-2">
  <label className="text-xs font-medium text-neutral-300">Color</label>
  <div className="flex flex-wrap gap-2 overflow-visible">
    {presets.map((preset) => {
      const isActive = strokeColor === preset;
      return (
        <button
          key={preset}
          onClick={() => setToolOption("arrow", "strokeColor", preset)}
          className={cn(
            "h-7 w-7 rounded-md border transition-colors duration-150",
            isActive
              ? "border-neutral-200 outline outline-2 outline-neutral-400"
              : "border-neutral-700 hover:border-neutral-500"
          )}
          style={{ backgroundColor: preset }}
        />
      );
    })}
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
          onChange={(e) => setToolOption("arrow", "strokeWidth", parseInt(e.target.value))}
          className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-neutral-800 accent-neutral-200"
        />
      </div>

      {/* Tip */}
      <div className="p-3 bg-neutral-900 border border-neutral-800 rounded-lg">
        <p className="text-[11px] text-neutral-400 leading-relaxed">
          <strong className="text-neutral-300">Tip:</strong> Select an arrow and toggle between one-way (→) and two-way (↔) directions.
        </p>
      </div>
    </div>
  );
}