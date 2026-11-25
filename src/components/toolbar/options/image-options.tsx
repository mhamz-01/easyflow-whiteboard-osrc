"use client";

// Image tool options panel — opacity slider and filter controls for placed FabricImage objects.

import { useWhiteboardStore } from "../../../store/whiteboard-store";
import { Slider } from "../../ui/slider";

export default function ImageOptions() {
  const toolOptions = useWhiteboardStore((state) => state.toolOptions);
  const setToolOption = useWhiteboardStore((state) => state.setToolOption);

  return (
    <div className="space-y-4">
      {/* Opacity Control */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs text-neutral-400">Opacity</label>
          <span className="text-xs text-neutral-500">
            {Math.round(toolOptions.image.opacity * 100)}%
          </span>
        </div>
        <Slider
          value={toolOptions.image.opacity}
          min={0}
          max={1}
          step={0.01}
          onValueChange={(value) => setToolOption("image", "opacity", value)}
          aria-label="Opacity"
        />
      </div>

      {/* Info Text */}
      <div className="mt-4 p-3 bg-neutral-800/50 rounded-lg border border-neutral-700">
        <p className="text-xs text-neutral-400">
          Click the <strong className="text-neutral-200">Image</strong> button to upload an image from your computer.
        </p>
        <p className="text-xs text-neutral-500 mt-2">
          Supported formats: JPG, PNG, GIF, WebP
        </p>
      </div>

      {/* Image Tips */}
      <div className="space-y-2">
        <p className="text-xs text-neutral-400">Tips</p>
        <ul className="text-xs text-neutral-500 space-y-1 list-disc list-inside">
          <li>Drag corners to resize</li>
          <li>Click and drag to move</li>
          <li>Use Delete key to remove</li>
          <li>Double-click to edit properties</li>
        </ul>
      </div>
    </div>
  );
}