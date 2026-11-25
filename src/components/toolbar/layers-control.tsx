"use client";

// Layer ordering controls — bring to front/back and step forward/backward for the currently selected Fabric object.

import { ArrowUp, ArrowDown, ChevronsUp, ChevronsDown } from "lucide-react";
import { Canvas } from "fabric";
import { useWhiteboardStore } from "../../store/whiteboard-store";

interface LayerControlsProps {
  fabricCanvas: React.RefObject<Canvas | null>;
}

export default function LayerControls({ fabricCanvas }: LayerControlsProps) {
  const { bringToFront, sendToBack, bringForward, sendBackward } = useWhiteboardStore();

  const handleAction = (action: (canvas: Canvas) => void) => {
    const canvas = fabricCanvas.current;
    if (canvas) action(canvas);
  };

  const buttonClass = "p-2.5 rounded-md transition-all duration-200 flex items-center justify-center relative group hover:bg-white/20 active:bg-white/30 cursor-pointer";
  const tooltipClass = "absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-[var(--wb-surface)]/95 text-white text-xs rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 font-medium shadow-lg";

  return (
    <div className="flex flex-col gap-3 p-3 bg-gradient-to-b from-white/10 to-white/5 rounded-lg border border-white/15 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-white/60"></div>
        <p className="text-xs font-semibold text-white/70 uppercase tracking-wide">Layer Order</p>
      </div>

      {/* Layer Controls Grid */}
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => handleAction(bringToFront)} className={buttonClass}>
          <ChevronsUp size={18} className="text-white" />
          <span className={tooltipClass}>
            Bring to Front
            <span className="block text-white/70 text-[10px] font-normal mt-0.5">Jump to top</span>
          </span>
        </button>

        <button onClick={() => handleAction(sendToBack)} className={buttonClass}>
          <ChevronsDown size={18} className="text-white" />
          <span className={tooltipClass}>
            Send to Back
            <span className="block text-white/70 text-[10px] font-normal mt-0.5">Jump to bottom</span>
          </span>
        </button>

        <button onClick={() => handleAction(bringForward)} className={buttonClass}>
          <ArrowUp size={18} className="text-white" />
          <span className={tooltipClass}>
            Bring Forward
            <span className="block text-white/70 text-[10px] font-normal mt-0.5">Move up one</span>
          </span>
        </button>

        <button onClick={() => handleAction(sendBackward)} className={buttonClass}>
          <ArrowDown size={18} className="text-white" />
          <span className={tooltipClass}>
            Send Backward
            <span className="block text-white/70 text-[10px] font-normal mt-0.5">Move down one</span>
          </span>
        </button>
      </div>

      {/* Legend */}
      <div className="text-xs text-white/40 space-y-1.5 pt-2 border-t border-white/10">
        <div className="flex gap-2 items-center">
          <div className="flex gap-1">
            <ChevronsUp size={13} className="text-white/50" />
            <ChevronsDown size={13} className="text-white/50" />
          </div>
          <span>= Jump to extreme layer</span>
        </div>
        <div className="flex gap-2 items-center">
          <div className="flex gap-1">
            <ArrowUp size={13} className="text-white/50" />
            <ArrowDown size={13} className="text-white/50" />
          </div>
          <span>= Move one layer</span>
        </div>
      </div>
    </div>
  );
}