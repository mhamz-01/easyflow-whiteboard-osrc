// Pan tool — click-drag to scroll the canvas viewport; two-finger pinch to zoom on touch devices.

import { useEffect, useRef, RefObject } from "react";
import { Canvas } from "fabric";

interface UsePanProps {
  fabricCanvas: RefObject<Canvas | null>;
  activeTool: string;
  handleZoom: (zoom: number, point?: { x: number; y: number }) => void;
  setCanvasViewport: (viewport: { x: number; y: number }) => void;
}

export const usePan = ({
  fabricCanvas,
  activeTool,
  handleZoom,
  setCanvasViewport,
}: UsePanProps) => {
  // Refs so the effect registers ONCE but always reads latest values.
  // Avoids tearing down/reattaching mouse:down/move/up on every tool change.
  const activeToolRef        = useRef(activeTool);
  const handleZoomRef        = useRef(handleZoom);
  const setCanvasViewportRef = useRef(setCanvasViewport);

  // Assigned synchronously in render — always fresh before any event fires
  activeToolRef.current        = activeTool;
  handleZoomRef.current        = handleZoom;
  setCanvasViewportRef.current = setCanvasViewport;

  useEffect(() => {
    const canvas = fabricCanvas.current;
    if (!canvas) return;

    const canvasEl = canvas.getElement();
    canvasEl.style.touchAction = "none";

    let isPanning         = false;
    let lastX             = 0;
    let lastY             = 0;
    let lastTouchDistance = 0;

    const onDown = (opt: any) => {
      if (activeToolRef.current !== "pan") return;
      const e = opt.e;

      if (e.touches && e.touches.length === 2) {
        isPanning = false;
        lastTouchDistance = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        return;
      }

      const pointer = e.touches ? e.touches[0] : e;
      isPanning = true;
      lastX = pointer.clientX;
      lastY = pointer.clientY;
      canvas.setCursor("grabbing");
    };

    const onMove = (opt: any) => {
      if (activeToolRef.current !== "pan") return;
      const e = opt.e;

      if (e.touches && e.touches.length === 2) {
        const currentDistance = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );

        if (lastTouchDistance > 0) {
          const zoom  = canvas.getZoom();
          const delta = (currentDistance - lastTouchDistance) * 0.01;
          const midX  = (e.touches[0].clientX + e.touches[1].clientX) / 2;
          const midY  = (e.touches[0].clientY + e.touches[1].clientY) / 2;
          const rect  = canvasEl.getBoundingClientRect();

          handleZoomRef.current(zoom + delta, {
            x: midX - rect.left,
            y: midY - rect.top,
          });
        }
        lastTouchDistance = currentDistance;
        return;
      }

      if (!isPanning) return; // early exit — avoids any work on non-pan moves

      const pointer = e.touches ? e.touches[0] : e;
      const vpt     = canvas.viewportTransform;
      if (!vpt) return;

      // VPT mutation is synchronous — NO rAF here intentionally.
      // rAF delays the mutation by one frame which makes pan feel like 20fps.
      vpt[4] += pointer.clientX - lastX;
      vpt[5] += pointer.clientY - lastY;
      canvas.requestRenderAll();

      lastX = pointer.clientX;
      lastY = pointer.clientY;
    };

    const onUp = () => {
      if (!isPanning && lastTouchDistance === 0) return; // nothing to clean up

      const vpt = canvas.viewportTransform;
      if (vpt) {
        // React state update only on mouse:up — not per-frame during pan
        setCanvasViewportRef.current({ x: vpt[4], y: vpt[5] });
      }

      isPanning         = false;
      lastTouchDistance = 0;
      canvas.setCursor(activeToolRef.current === "pan" ? "grab" : "default");
    };

    canvas.on("mouse:down", onDown);
    canvas.on("mouse:move", onMove);
    canvas.on("mouse:up",   onUp);

    return () => {
      canvas.off("mouse:down", onDown);
      canvas.off("mouse:move", onMove);
      canvas.off("mouse:up",   onUp);
    };
  }, [fabricCanvas]); // registered once per canvas mount
};