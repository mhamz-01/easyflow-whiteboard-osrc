"use client";

// Eraser tool options panel — brush size control for the eraser tool.

import { useWhiteboardStore } from "../../../store/whiteboard-store";

const PRESET_SIZES = [10, 20, 30, 50];

export default function EraserOptions() {
  const toolOptions = useWhiteboardStore((state) => state.toolOptions);
  const setToolOption = useWhiteboardStore((state) => state.setToolOption);

  const { size } = toolOptions.eraser;

  return (
    <div className="space-y-6 text-neutral-200">
      {/* Section title */}
      <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
        Eraser Settings
      </p>

      {/* Eraser Size */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-neutral-300">Size</label>
          <span className="text-xs font-semibold text-neutral-100">{size}px</span>
        </div>

        {/* Preset sizes */}
        <div className="flex gap-2">
          {PRESET_SIZES.map((presetSize) => {
            const isActive = size === presetSize;
            return (
              <button
                key={presetSize}
                onClick={() => setToolOption("eraser", "size", presetSize)}
                className={`flex-1 h-8 rounded-lg border text-xs font-medium flex items-center justify-center transition-colors duration-150
                  ${isActive
                    ? "bg-neutral-700 border-neutral-500 text-white"
                    : "bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800"}
                `}
              >
                {presetSize}
              </button>
            );
          })}
        </div>

        {/* Slider */}
        <input
          type="range"
          min={5}
          max={100}
          step={5}
          value={size}
          onChange={(e) => setToolOption("eraser", "size", parseInt(e.target.value))}
          className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-neutral-800 accent-neutral-200"
        />
      </div>

      {/* Visual preview */}
      <div className="flex items-center justify-center p-4 bg-neutral-900 rounded-lg border border-neutral-700">
        <div
          className="rounded-full bg-neutral-500"
          style={{
            width: `${size}px`,
            height: `${size}px`,
          }}
        />
      </div>
    </div>
  );
}
