"use client";

// Zoom controls pill — displays current zoom percentage; + zooms in, − zooms out, clicking the number resets to 100%.

import { ZoomIn, ZoomOut, Minus, Plus } from "lucide-react";

interface ZoomControlsProps {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
}

export default function ZoomControls({
  zoom,
  onZoomIn,
  onZoomOut,
  onResetZoom,
}: ZoomControlsProps) {
  const zoomPercentage = Math.round(zoom * 100);

  return (
    <div className="absolute top-4 right-4 z-50">  {/* ← Changed from 'fixed' to 'absolute' */}
      <div className="
        flex items-center gap-0.5
        bg-[var(--wb-surface)]/95 backdrop-blur-md
        border border-white/10
        rounded-full
        px-1.5 py-1
        shadow-lg shadow-black/20
      ">
        {/* Zoom Out */}
        <button
          onClick={onZoomOut}
          className="
            w-7 h-7
            flex items-center justify-center
            hover:bg-white/10
            active:bg-white/20
            rounded-full
            transition-all
          "
          aria-label="Zoom Out"
        >
          <Minus className="w-3.5 h-3.5 text-white" strokeWidth={3} />
        </button>

        {/* Zoom Display */}
        <button
          onClick={onResetZoom}
          className="
            px-1
            min-w-[48px]
            text-xs font-bold text-white
            hover:text-blue-400
            transition-colors
            tabular-nums
            text-center
          "
        >
          {zoomPercentage}%
        </button>

        {/* Zoom In */}
        <button
          onClick={onZoomIn}
          className="
            w-7 h-7
            flex items-center justify-center
            hover:bg-white/10
            active:bg-white/20
            rounded-full
            transition-all
          "
          aria-label="Zoom In"
        >
          <Plus className="w-3.5 h-3.5 text-white" strokeWidth={3} />
        </button>
      </div>
    </div>
  );
}