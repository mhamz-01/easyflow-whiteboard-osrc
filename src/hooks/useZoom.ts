// Handles canvas zoom via mouse wheel, toolbar buttons, and Ctrl+/− keyboard shortcuts; prevents browser native zoom.

import { useCallback, useEffect, useRef, RefObject } from "react";
import { Canvas, Point, FabricObject } from "fabric";
import { isTypingTarget } from "../lib/utils";

interface UseZoomProps {
  fabricCanvas: RefObject<Canvas | null>;
  MIN_ZOOM: number;
  MAX_ZOOM: number;
  canvasZoom: number;
  canvasViewport: { x: number; y: number };
  setCanvasZoom: (zoom: number) => void;
  setCanvasViewport: (viewport: { x: number; y: number }) => void;
}

export const useZoom = ({
  fabricCanvas,
  MIN_ZOOM,
  MAX_ZOOM,
  setCanvasZoom,
  setCanvasViewport,
}: UseZoomProps) => {

  // ── PERF FIX 1: Stable refs for setters ──────────────────────────────────
  // setCanvasZoom and setCanvasViewport are new references every render from
  // FabricWhiteboard's useState. Putting them in deps caused handleZoom and
  // all effects to re-register on every render. Refs break the cycle.
  const setCanvasZoomRef    = useRef(setCanvasZoom);
  const setCanvasViewportRef = useRef(setCanvasViewport);
  setCanvasZoomRef.current    = setCanvasZoom;
  setCanvasViewportRef.current = setCanvasViewport;

  // ── PERF FIX 2: handleZoom reads limits from refs, stable reference ───────
  const minZoomRef = useRef(MIN_ZOOM);
  const maxZoomRef = useRef(MAX_ZOOM);
  minZoomRef.current = MIN_ZOOM;
  maxZoomRef.current = MAX_ZOOM;

  const handleZoom = useCallback((newZoom: number, point?: { x: number; y: number }) => {
    const canvas = fabricCanvas.current;
    if (!canvas) return;

    const clamped = Math.min(Math.max(newZoom, minZoomRef.current), maxZoomRef.current);
    const pivot = point
      ? new Point(point.x, point.y)
      : new Point(canvas.getWidth() / 2, canvas.getHeight() / 2);

    canvas.zoomToPoint(pivot, clamped);
    canvas.requestRenderAll();

    // Flush React state once per zoom action — not per frame
    const vpt = canvas.viewportTransform;
    if (vpt) {
      setCanvasZoomRef.current(clamped);
      setCanvasViewportRef.current({ x: vpt[4], y: vpt[5] });
    }
  // fabricCanvas ref is stable — this function never needs to be recreated
  }, [fabricCanvas]);

  // ── Wheel zoom + pan ───────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = fabricCanvas.current;
    if (!canvas) return;

    // ── PERF FIX 3: rAF-throttled viewport flush ─────────────────────────
    // setCanvasViewport on every wheel tick caused a React re-render per scroll
    // event (60-200/sec). Batch with rAF — flush at most once per paint frame.
    let rafId: number | null = null;
    const flushViewport = () => {
      rafId = null;
      const vpt = canvas.viewportTransform;
      if (vpt) setCanvasViewportRef.current({ x: vpt[4], y: vpt[5] });
    };
    const scheduleFlush = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(flushViewport);
    };

    const onWheel = (opt: any) => {
      const e = opt.e as WheelEvent;
      e.preventDefault();
      e.stopPropagation();

      const vpt = canvas.viewportTransform;
      if (!vpt) return;

      if (e.ctrlKey || e.metaKey) {
        // Zoom to cursor
        const rect = canvas.getElement().getBoundingClientRect();
        const currentZoom = canvas.getZoom();
        handleZoom(
          e.deltaY < 0 ? currentZoom * 1.1 : currentZoom / 1.1,
          { x: e.clientX - rect.left, y: e.clientY - rect.top }
        );
      } else {
        // Pan via scroll — mutate VPT directly, no React state until rAF
        vpt[5] -= e.deltaY;
        if (e.shiftKey) vpt[4] -= (e.deltaX || e.deltaY);

        // Keep active object coords in sync
        const activeObj = canvas.getActiveObject();
        if (activeObj) {
          activeObj.setCoords();
          if (activeObj.type === "activeSelection") {
            (activeObj as any).getObjects().forEach((o: FabricObject) => o.setCoords());
          }
        }

        canvas.calcOffset();
        canvas.requestRenderAll();
        // Batch React state flush — at most once per animation frame
        scheduleFlush();
      }
    };

    canvas.on("mouse:wheel", onWheel);
    return () => {
      canvas.off("mouse:wheel", onWheel);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  // ── PERF FIX 4: Empty deps — reads everything via refs or canvas directly ──
  // Old code had [canvasZoom, canvasViewport, handleZoom] here which caused
  // the listener to re-register on every single zoom/pan action.
  }, [fabricCanvas, handleZoom]);

  // ── Prevent browser zoom ──────────────────────────────────────────────────
  useEffect(() => {
    const prevent = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) e.preventDefault();
    };
    window.addEventListener("wheel", prevent, { passive: false });
    return () => window.removeEventListener("wheel", prevent);
  }, []);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (!(e.ctrlKey || e.metaKey)) return;

      const canvas = fabricCanvas.current;
      if (!canvas) return;

      if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        // ── PERF FIX 5: Read zoom from canvas directly, not from stale state ─
        handleZoom(canvas.getZoom() + 0.1);
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        handleZoom(canvas.getZoom() - 0.1);
      } else if (e.key === "0") {
        e.preventDefault();
        canvas.setZoom(1);
        const vpt = canvas.viewportTransform;
        if (vpt) { vpt[4] = 0; vpt[5] = 0; }
        canvas.requestRenderAll();
        setCanvasZoomRef.current(1);
        setCanvasViewportRef.current({ x: 0, y: 0 });
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // ── Stable — reads zoom from canvas directly, not from canvasZoom state ───
  }, [fabricCanvas, handleZoom]);

  // ── PERF FIX 6: after:render sync REMOVED ────────────────────────────────
  // The old code registered a "after:render" listener that called
  // setCanvasViewport + setCanvasZoom. Since after:render fires after EVERY
  // Fabric paint frame, this created an infinite loop:
  //   Fabric renders → setCanvasZoom → React re-renders → Fabric re-renders → ...
  // React state is now only updated at deliberate points:
  //   - handleZoom (once per zoom gesture)
  //   - scheduleFlush via rAF (once per animation frame during scroll pan)
  //   - usePan's onUp (once per pan gesture end)

  return { handleZoom };
};