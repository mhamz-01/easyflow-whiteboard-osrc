"use client";

// Text tool options panel — font family, font size, font weight, text alignment, and color controls.

import { useWhiteboardStore } from "../../../store/whiteboard-store";
import { cn } from "../../../lib/utils";
import { AlignLeft, AlignCenter, AlignRight, AlignJustify, ChevronDown } from "lucide-react";
import { useState } from "react";

// Professional fonts for whiteboard use
const FONT_FAMILIES = [
  { value: "Inter", label: "Inter", style: "font-sans" },
  { value: "Roboto", label: "Roboto", style: "font-sans" },
  { value: "Caveat", label: "Caveat", style: "font-handwriting" },
  { value: "Courier New", label: "Courier", style: "font-mono" },
  { value: "Georgia", label: "Georgia", style: "font-serif" },
];

const FONT_WEIGHTS = [
  { value: "300", label: "Light" },
  { value: "400", label: "Regular" },
  { value: "600", label: "Medium" },
  { value: "700", label: "Bold" },
];

const PRESET_SIZES = [12, 16, 20, 24, 32, 48];

const PRESET_COLORS = [
  "#000000", // Black
  "#FFFFFF", // White
  "#DC2626", // Red
  "#EA580C", // Orange
  "#CA8A04", // Yellow
  "#16A34A", // Green
  "#2563EB", // Blue
  "#7C3AED", // Purple
  "#DB2777", // Pink
];

const TEXT_ALIGNMENTS = [
  { value: "left", icon: AlignLeft, label: "Left" },
  { value: "center", icon: AlignCenter, label: "Center" },
  { value: "right", icon: AlignRight, label: "Right" },
  { value: "justify", icon: AlignJustify, label: "Justify" },
];

export default function TextOptions() {
  const toolOptions = useWhiteboardStore((state) => state.toolOptions);
  const setToolOption = useWhiteboardStore((state) => state.setToolOption);

  const { fontSize, fontFamily, fontWeight, color, textAlign } = toolOptions.text;
  
  const [fontDropdownOpen, setFontDropdownOpen] = useState(false);

  const selectedFont = FONT_FAMILIES.find(f => f.value === fontFamily) || FONT_FAMILIES[0];
  const isPresetColor = PRESET_COLORS.includes(color);

  return (
    <div className="space-y-6 text-neutral-200">
      {/* Section title */}
      <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
        Text Settings
      </p>

      {/* Font Family - Custom Dropdown */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-neutral-300">Font</label>
        <div className="relative">
          <button
            onClick={() => setFontDropdownOpen(!fontDropdownOpen)}
            className="w-full px-3 py-2.5 border border-neutral-700 bg-neutral-900 text-sm text-neutral-200 rounded-lg hover:bg-neutral-800 transition-colors flex items-center justify-between"
          >
            <span className={selectedFont.style}>{selectedFont.label}</span>
            <ChevronDown className={cn(
              "w-4 h-4 transition-transform",
              fontDropdownOpen && "rotate-180"
            )} />
          </button>
          
          {fontDropdownOpen && (
            <>
              {/* Backdrop */}
              <div 
                className="fixed inset-0 z-10" 
                onClick={() => setFontDropdownOpen(false)}
              />
              
              {/* Dropdown menu */}
              <div className="absolute top-full left-0 right-0 mt-1 bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl z-20 overflow-hidden">
                {FONT_FAMILIES.map((font) => (
                  <button
                    key={font.value}
                    onClick={() => {
                      setToolOption("text", "fontFamily", font.value);
                      setFontDropdownOpen(false);
                    }}
                    className={cn(
                      "w-full px-3 py-2.5 text-left text-sm transition-colors",
                      font.style,
                      font.value === fontFamily
                        ? "bg-neutral-700 text-white"
                        : "text-neutral-200 hover:bg-neutral-800"
                    )}
                  >
                    {font.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Font Weight */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-neutral-300">Weight</label>
        <div className="grid grid-cols-4 gap-2">
          {FONT_WEIGHTS.map((weight) => {
            const isActive = fontWeight === weight.value;
            return (
              <button
                key={weight.value}
                onClick={() => setToolOption("text", "fontWeight", weight.value)}
                className={cn(
                  "h-9  rounded-lg border text-xs font-medium transition-colors duration-150",
                  isActive
                    ? "bg-neutral-700 border-neutral-500 text-white"
                    : "bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800"
                )}
              >
                {weight.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Font Size */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-neutral-300">Size</label>
          <span className="text-xs font-semibold text-neutral-100">{fontSize}px</span>
        </div>

        {/* Preset sizes */}
        <div className="grid grid-cols-6 gap-2">
          {PRESET_SIZES.map((size) => {
            const isActive = fontSize === size;
            return (
              <button
                key={size}
                onClick={() => setToolOption("text", "fontSize", size)}
                className={cn(
                  "h-8 rounded-lg border text-xs font-medium transition-colors duration-150",
                  isActive
                    ? "bg-neutral-700 border-neutral-500 text-white"
                    : "bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800"
                )}
              >
                {size}
              </button>
            );
          })}
        </div>

        <input
          type="range"
          min={8}
          max={72}
          step={2}
          value={fontSize}
          onChange={(e) => setToolOption("text", "fontSize", parseInt(e.target.value))}
          className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-neutral-800 accent-neutral-200"
        />
      </div>

      {/* Text Color - Preset colors */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-neutral-300">Color</label>
        
        <div className="flex items-center gap-3 overflow-visible pr-1">
          {/* Preset colors */}
          <div className="flex flex-wrap gap-2 overflow-visible">
            {PRESET_COLORS.map((preset) => {
              const isActive = color === preset;
              return (
                <button
                  key={preset}
                  onClick={() => setToolOption("text", "color", preset)}
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
                onChange={(e) => setToolOption("text", "color", e.target.value)}
                className="absolute inset-0 opacity-0 cursor-pointer"
                aria-label="Custom color"
              />
            </label>
          </div> */}
        </div>
      </div>

      {/* Text Alignment */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-neutral-300">Alignment</label>
        <div className="grid grid-cols-4 gap-2">
          {TEXT_ALIGNMENTS.map((alignment) => {
            const isActive = textAlign === alignment.value;
            const Icon = alignment.icon;
            return (
              <button
                key={alignment.value}
                onClick={() => setToolOption("text", "textAlign", alignment.value)}
                className={cn(
                  "h-9 rounded-lg border transition-colors duration-150 flex items-center justify-center",
                  isActive
                    ? "bg-neutral-700 border-neutral-500 text-white"
                    : "bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800"
                )}
                title={alignment.label}
              >
                <Icon className="w-4 h-4" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}