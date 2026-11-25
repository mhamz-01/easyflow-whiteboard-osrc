// Canvas event router — registers Fabric mouse events once and dispatches to drawing/eraser handlers with rAF throttle on mouse:move.

import { useEffect, useRef, RefObject } from "react";
import { Canvas } from "fabric";

interface UseMouseHandlersProps {
  fabricCanvas: RefObject<Canvas | null>;
  activeTool:   string;
  toolOptions:  any;
  drawingHandlers: {
    handleMouseDown: (opt: any) => void;
    handleMouseMove: (opt: any) => void;
    handleMouseUp:   () => void;
  };
  eraserHandlers: {
    handleMouseOver:  () => void;
    handleMouseOut:   () => void;
    handleEraserDown: () => boolean;
    handleEraserMove: (pointer: { x: number; y: number }) => void;
    handleEraserUp:   () => boolean;
  };
}

export const useMouseHandlers = ({
  fabricCanvas,
  activeTool,
  drawingHandlers,
  eraserHandlers,
}: UseMouseHandlersProps) => {

  // ── PERF FIX 1: All props in refs — effect registers ONCE ────────────────
  // Old deps: [activeTool, toolOptions, drawingHandlers, eraserHandlers]
  // drawingHandlers and eraserHandlers are plain objects recreated every render
  // → all 5 canvas listeners re-registered on every single render.
  // With refs, the effect is stable for the full lifetime of the canvas.
  const activeToolRef      = useRef(activeTool);
  const drawingRef         = useRef(drawingHandlers);
  const eraserRef          = useRef(eraserHandlers);

  // These update every render synchronously — handlers always see latest values
  activeToolRef.current = activeTool;
  drawingRef.current    = drawingHandlers;
  eraserRef.current     = eraserHandlers;

  useEffect(() => {
    const canvas = fabricCanvas.current;
    if (!canvas) return;

    // ── PERF FIX 2: rAF throttle on mouse:move ───────────────────────────
    // mouse:move fires at raw pointer rate — up to 200-1000 events/sec on
    // high-DPI displays. Without throttling, getScenePoint + handler logic
    // runs far more often than the screen can paint (60-120fps).
    let rafId: number | null = null;
    let lastMoveOpt: any     = null;

    const handleMouseDown = (opt: any) => {
      if (eraserRef.current.handleEraserDown()) return;
      drawingRef.current.handleMouseDown(opt);
    };

    const handleMouseMove = (opt: any) => {
      // Store latest event — rAF will consume it
      lastMoveOpt = opt;
      if (rafId !== null) return; // frame already queued

      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (!lastMoveOpt) return;
        const currentOpt = lastMoveOpt;
        lastMoveOpt = null;

        const tool = activeToolRef.current;

        if (tool === "eraser") {
          // ── PERF FIX 3: Only call getScenePoint for tools that need it ────
          const canvas = fabricCanvas.current;
          if (!canvas) return;
          const pointer = canvas.getScenePoint(currentOpt.e as MouseEvent);
          eraserRef.current.handleEraserMove(pointer);
          return;
        }

        drawingRef.current.handleMouseMove(currentOpt);
      });
    };

    const handleMouseUp = () => {
      // Cancel any pending move frame on mouse up
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
        lastMoveOpt = null;
      }
      if (eraserRef.current.handleEraserUp()) return;
      drawingRef.current.handleMouseUp();
    };

    canvas.on("mouse:over", () => eraserRef.current.handleMouseOver());
    canvas.on("mouse:out",  () => eraserRef.current.handleMouseOut());
    canvas.on("mouse:down", handleMouseDown);
    canvas.on("mouse:move", handleMouseMove);
    canvas.on("mouse:up",   handleMouseUp);

    return () => {
      canvas.off("mouse:over", () => eraserRef.current.handleMouseOver());
      canvas.off("mouse:out",  () => eraserRef.current.handleMouseOut());
      canvas.off("mouse:down", handleMouseDown);
      canvas.off("mouse:move", handleMouseMove);
      canvas.off("mouse:up",   handleMouseUp);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  // ── PERF FIX 4: Stable — everything read via refs ─────────────────────────
  }, [fabricCanvas]);
};