"use client";

// Tool properties sidebar — slides in with the relevant options panel for the active tool or the type of the selected object.

import React, { RefObject, useEffect, useMemo, useState, useCallback } from "react";

import { cn } from "../../lib/utils";
import { useWhiteboardStore } from "../../store/whiteboard-store";
import PenOptions from "./options/pen-option";
import ShapeOptions from "./options/shape-option";
import TextOptions from "./options/text-option";
import ImageOptions from "./options/image-options";
import LineOptions from "./options/line-options";
import ArrowOptions from "./options/arrow-options";
import ConnectorOptions from "./options/connector-options";
import fabric, { Rect, Circle, IText, FabricImage } from "fabric";
import { Settings2, ChevronDown, ChevronUp, X } from "lucide-react";
import LayerControls from "./layers-control";

interface ToolOptionsPanelProps {
  fabricCanvas: RefObject<fabric.Canvas | null>;
}

// ── Memoized child components ─────────────────────────────────────────────────
const MemoizedPenOptions = React.memo(PenOptions);
const MemoizedShapeOptions = React.memo(ShapeOptions);
const MemoizedTextOptions = React.memo(TextOptions);
const MemoizedImageOptions = React.memo(ImageOptions);
const MemoizedLineOptions = React.memo(LineOptions);
const MemoizedArrowOptions = React.memo(ArrowOptions);
const MemoizedConnectorOptions = React.memo(ConnectorOptions);
const MemoizedLayerControls = React.memo(LayerControls);

export default React.memo(function ToolOptionsPanel({
  fabricCanvas,
}: ToolOptionsPanelProps) {
  const activeTool = useWhiteboardStore((state) => state.activeTool);
  const selectedObjectType = useWhiteboardStore((state) => state.selectedObjectType);
  const toolOptions = useWhiteboardStore((state) => state.toolOptions);

  const [isMobileExpanded, setIsMobileExpanded] = useState(false);

  const displayTool = selectedObjectType || activeTool;

  // ── Real-time fabric updates ──────────────────────────────────────────────────
  useEffect(() => {
    const canvas = fabricCanvas.current;
    if (!canvas) return;
    const selectedObject = canvas.getActiveObject();
    if (!selectedObject || !selectedObjectType) return;

    switch (selectedObjectType) {
      case "rectangle":
        if (selectedObject instanceof Rect) {
          selectedObject.set({
            fill: toolOptions.rectangle.fillColor,
            stroke: toolOptions.rectangle.strokeColor,
            strokeWidth: toolOptions.rectangle.strokeWidth,
          });
        }
        break;
      case "circle":
        if (selectedObject instanceof Circle) {
          selectedObject.set({
            fill: toolOptions.circle.fillColor,
            stroke: toolOptions.circle.strokeColor,
            strokeWidth: toolOptions.circle.strokeWidth,
          });
        }
        break;
      case "text":
        if (selectedObject instanceof IText) {
          selectedObject.set({
            fill: toolOptions.text.color,
            fontSize: toolOptions.text.fontSize,
            fontFamily: toolOptions.text.fontFamily,
          });
        }
        break;
    }
    canvas.renderAll();
  }, [toolOptions, selectedObjectType, fabricCanvas]);

  // ── Memoized constants ────────────────────────────────────────────────────────
  const toolsWithoutOptions = useMemo(
    () => ["select", "pan", "undo", "redo", "eraser"],
    []
  );

  const isOpen = useMemo(() => {
    const target = selectedObjectType || activeTool;
    return target && !toolsWithoutOptions.includes(target);
  }, [activeTool, selectedObjectType, toolsWithoutOptions]);

  // ── Auto-collapse mobile panel when tool changes ───────────────────────────────
  useEffect(() => {
    if (!isOpen) {
      setIsMobileExpanded(false);
    }
  }, [isOpen]);

  // ── Memoized handlers ─────────────────────────────────────────────────────────
  const handleMobileToggle = useCallback(() => {
    setIsMobileExpanded((prev) => !prev);
  }, []);

  // ── Memoized desktop sidebar content ──────────────────────────────────────────
  const desktopContent = useMemo(() => {
    return (
      <div className="space-y-6 text-neutral-200">
        {displayTool === "pen" && <MemoizedPenOptions />}
        {(displayTool === "rectangle" || displayTool === "circle" || displayTool === "frame") && (
          <MemoizedShapeOptions shapeType={displayTool} />
        )}
        {displayTool === "text" && <MemoizedTextOptions />}
        {displayTool === "image" && <MemoizedImageOptions />}
        {displayTool === "line" && <MemoizedLineOptions />}
        {displayTool === "arrow" && <MemoizedArrowOptions fabricCanvas={fabricCanvas} />}
        {displayTool === "connector" && <MemoizedConnectorOptions />}
        {selectedObjectType && <MemoizedLayerControls fabricCanvas={fabricCanvas} />}
      </div>
    );
  }, [displayTool, selectedObjectType, fabricCanvas]);

  // ── Memoized mobile content ───────────────────────────────────────────────────
  const mobileContent = useMemo(() => {
    return (
      <div className="px-4 pb-5 pt-2 space-y-4 overflow-y-auto max-h-[60vh] custom-scrollbar">
        <div className="h-[1px] w-full bg-white/5 mb-4" />
        {displayTool === "pen" && <MemoizedPenOptions />}
        {(displayTool === "rectangle" || displayTool === "circle" || displayTool === "frame") && (
          <MemoizedShapeOptions shapeType={displayTool} />
        )}
        {displayTool === "text" && <MemoizedTextOptions />}
        {displayTool === "image" && <MemoizedImageOptions />}
        {displayTool === "line" && <MemoizedLineOptions />}
        {displayTool === "arrow" && <MemoizedArrowOptions fabricCanvas={fabricCanvas} />}
        {displayTool === "connector" && <MemoizedConnectorOptions />}
      </div>
    );
  }, [displayTool, fabricCanvas]);

  // ── Memoized desktop header ───────────────────────────────────────────────────
  const desktopHeader = useMemo(
    () => (
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
        <div className="flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-[#029AFF]" />
          <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-neutral-400">
            Properties
          </h3>
        </div>
        <div className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-white/40 border border-white/5">
          {displayTool}
        </div>
      </div>
    ),
    [displayTool]
  );

  // ── Memoized mobile header ────────────────────────────────────────────────────
  const mobileHeader = useMemo(
    () => (
      <div
        className="flex items-center justify-between px-4 h-[48px] cursor-pointer"
        onClick={handleMobileToggle}
      >
        <div className="flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-[#029AFF]" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-300">
            {displayTool} Settings
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div
            className={cn(
              "transition-transform duration-300",
              isMobileExpanded ? "rotate-180" : "rotate-0"
            )}
          >
            <ChevronDown className="w-4 h-4 text-white/50" />
          </div>
        </div>
      </div>
    ),
    [displayTool, isMobileExpanded, handleMobileToggle]
  );

  // ── Memoized desktop sidebar classes ──────────────────────────────────────────
  const desktopSidebarClasses = useMemo(
    () =>
      cn(
        "hidden md:flex",
        "absolute left-4 top-1/2 -translate-y-1/2 z-40",
        "flex-col",
        "w-64 max-h-[85vh]",
        "bg-[var(--wb-panel)]/90 backdrop-blur-xl",
        "border border-white/10",
        "shadow-[0_20px_50px_rgba(0,0,0,0.5)]",
        "rounded-[24px]",
        "transition-all duration-500 cubic-bezier(0.16, 1, 0.3, 1)",
        isOpen
          ? "translate-x-0 opacity-100 visible scale-100"
          : "-translate-x-12 opacity-0 invisible scale-95 pointer-events-none"
      ),
    [isOpen]
  );

  // ── Memoized mobile panel classes ─────────────────────────────────────────────
  const mobilePanelClasses = useMemo(
    () =>
      cn(
        "md:hidden",
        "fixed left-3 top-4 z-40",
        "w-[calc(100%-80px)] max-w-[180px]",
        "bg-[var(--wb-panel)]/95 backdrop-blur-xl",
        "border border-white/10",
        "rounded-2xl shadow-2xl",
        "transition-all duration-300 ease-in-out",
        isMobileExpanded ? "max-h-[70vh]" : "h-[48px]"
      ),
    [isMobileExpanded]
  );

  // ── Memoized mobile content container classes ─────────────────────────────────
  const mobileContentClasses = useMemo(
    () =>
      cn(
        "overflow-hidden transition-all duration-300",
        isMobileExpanded ? "opacity-100 h-auto" : "opacity-0 h-0"
      ),
    [isMobileExpanded]
  );

  return (
    <>
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* DESKTOP - Left Sidebar */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <aside className={desktopSidebarClasses}>
        <div className="absolute -left-[1px] top-1/2 -translate-y-1/2 w-[3px] h-12 bg-[#029AFF] rounded-r-full shadow-[0_0_15px_#029AFF]" />

        {desktopHeader}

        <div className="flex-1 overflow-y-auto p-5 custom-scrollbar scroll-smooth">
          {desktopContent}
        </div>

        <div className="p-3 flex justify-center">
          <div className="w-8 h-1 rounded-full bg-white/10" />
        </div>
      </aside>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* MOBILE - Left Side Floating Panel */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {isOpen && (
        <div className={mobilePanelClasses}>
          {mobileHeader}

          <div className={mobileContentClasses}>{mobileContent}</div>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: var(--wb-tint-10);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #029AFF;
        }
      `}</style>
    </>
  );
}, (prev, next) => {
  // Custom comparator for React.memo
  // Return true to skip re-render, false to re-render
  return prev.fabricCanvas === next.fabricCanvas;
});