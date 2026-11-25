import { useEffect } from "react";
import type { RefObject, WheelEvent as ReactWheelEvent } from "react";
import type { Canvas } from "fabric";

interface UseWheelZoomProps {
  overlayRef: RefObject<HTMLDivElement | null>;
  fabricCanvas?: RefObject<Canvas | null>;
  canvasReady?: boolean;
}

/**
 * SRP: forwards wheel events that land on HTML nodes into Fabric's event bus
 * so the canvas zoom/pan handlers fire regardless of which layer the user
 * is hovering over.
 *
 * Two mechanisms:
 *  handleOverlayWheel — React synthetic handler attached to the overlay div
 *  native listener    — passive:false DOM listener so e.preventDefault() works
 *                       (React synthetic events cannot cancel passive listeners)
 */
export function useWheelZoom({
  overlayRef,
  fabricCanvas,
  canvasReady = false,
}: UseWheelZoomProps) {
  const handleOverlayWheel = (e: ReactWheelEvent<HTMLDivElement>) => {
    if (!(e.ctrlKey || e.metaKey || e.shiftKey)) return;
    const canvas = fabricCanvas?.current;
    if (!canvas) return;

    const nativeEvent = e.nativeEvent;
    const scenePoint = canvas.getScenePoint(nativeEvent);
    const rect = canvas.getElement().getBoundingClientRect();
    const viewportPoint = {
      x: nativeEvent.clientX - rect.left,
      y: nativeEvent.clientY - rect.top,
    };

    canvas.fire("mouse:wheel", { e: nativeEvent, scenePoint, viewportPoint } as any);
    e.preventDefault();
    e.stopPropagation();
  };

  useEffect(() => {
    const overlayEl = overlayRef.current;
    const canvas = fabricCanvas?.current;
    if (!overlayEl || !canvas) return;

    const handleGlobalWheel = (e: WheelEvent) => {
      const isOverNode = (e.target as HTMLElement) !== overlayEl;
      if (!(e.ctrlKey || e.metaKey) || !isOverNode) return;

      e.preventDefault();
      e.stopPropagation();

      const scenePoint = canvas.getScenePoint(e);
      const rect = canvas.getElement().getBoundingClientRect();
      const viewportPoint = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };

      canvas.fire("mouse:wheel", { e, scenePoint, viewportPoint } as any);
    };

    overlayEl.addEventListener("wheel", handleGlobalWheel, { passive: false });
    return () => overlayEl.removeEventListener("wheel", handleGlobalWheel);
  }, [fabricCanvas, canvasReady, overlayRef]);

  return { handleOverlayWheel };
}
