// Initialises the Fabric canvas on mount, hydrates saved state (canvas JSON + HTML nodes), and wires resize/touch handlers.

import { useEffect, useRef, RefObject, useState } from "react";
import { Canvas } from "fabric";
import { initializeFabricCanvas, addWelcomeContent } from "../lib/fabric-utils";
import { useWhiteboardStore } from "../store/whiteboard-store";
import type { WhiteboardNode } from "../types/canvas-node";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WhiteboardInitialData {
  /** `canvas` string from a previous `onSave` payload. */
  canvas?: string;
  /** `nodes` from a previous `onSave` payload. Ignored when the `nodes` prop is controlled. */
  nodes?:  WhiteboardNode[];
}

interface UseCanvasInitProps {
  canvasRef:          RefObject<HTMLCanvasElement | null>;
  fabricCanvasRef:    RefObject<Canvas | null>;
  activeTool:         string;
  suppressHistoryRef: RefObject<boolean>;
  isRestoringRef:     RefObject<boolean>;
  pushHistory:        (state: string) => void;
  onNodesLoaded:      (nodes: WhiteboardNode[]) => void;
  initialData?:       WhiteboardInitialData;
  /** Hydration waits until this is false, so data fetched after mount still loads. */
  isLoadingData?:     boolean;
  /** True when the board already has nodes (controlled mode): no welcome screen. */
  hasExternalNodes?:  boolean;
  onReady?: () => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export const useCanvasInit = ({
  canvasRef,
  fabricCanvasRef,
  activeTool,
  suppressHistoryRef,
  isRestoringRef,
  pushHistory,
  onNodesLoaded,
  initialData,
  isLoadingData = false,
  hasExternalNodes = false,
  onReady,
}: UseCanvasInitProps) => {
  // Hydration reads the latest props when it finally runs, not the first render's.
  const latest = useRef({ initialData, onNodesLoaded, onReady, hasExternalNodes, pushHistory });
  latest.current = { initialData, onNodesLoaded, onReady, hasExternalNodes, pushHistory };
  // Bumped on every canvas creation (twice under StrictMode) so hydration re-runs for the new canvas.
  const [canvasVersion, setCanvasVersion] = useState(0);
  const hydratedRef = useRef(false);

  // Seeds the canvas's initial interactivity. useToolManager takes over from
  // here and reacts to later editable toggles — this only avoids a flash of
  // selectable objects on a read-only mount.
  const editable = useWhiteboardStore((s) => s.editable);

  useEffect(() => {
    if (!canvasRef.current || fabricCanvasRef.current) return;

    const canvas = new Canvas(canvasRef.current, {
      width:               window.innerWidth,
      height:              window.innerHeight,
      backgroundColor:     "transparent",
      selection:           editable,
      allowTouchScrolling: false,
      stopContextMenu:     true,
      objectCaching:       true,
    });

    fabricCanvasRef.current = canvas;
    initializeFabricCanvas(canvas);

    const canvasElement = canvas.getElement();
    canvasElement.style.touchAction = "none";

    setCanvasVersion((v) => v + 1);

    // ── Event handlers ────────────────────────────────────────────────────────
    const preventDefaults = (e: TouchEvent) => {
      if (e.touches.length === 1) return;
      e.preventDefault();
    };

    const handleResize = () => {
      canvas.setDimensions({ width: window.innerWidth, height: window.innerHeight });
      canvas.renderAll();
    };

    window.addEventListener("resize", handleResize);
    canvasElement.addEventListener("touchstart", preventDefaults, { passive: false });
    canvasElement.addEventListener("touchmove",  preventDefaults, { passive: false });

    // ── Cleanup ───────────────────────────────────────────────────────────────
    return () => {
      hydratedRef.current = false;
      window.removeEventListener("resize", handleResize);
      canvasElement.removeEventListener("touchstart", preventDefaults);
      canvasElement.removeEventListener("touchmove",  preventDefaults);
      canvas.dispose();
      fabricCanvasRef.current = null;
    };
  }, []);

  // ── Hydration ──────────────────────────────────────────────────────────────
  // Runs once per canvas, as soon as the consumer's data has loaded.
  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || canvasVersion === 0 || isLoadingData || hydratedRef.current) return;

    // Tracks whether cleanup has run — prevents hydrateCanvas from running
    // after canvas.dispose() if the rAFs or the JSON load finish post-unmount.
    let disposed = false;
    const isGone = () => disposed || fabricCanvasRef.current !== canvas;

    const hydrateCanvas = async () => {
      if (isGone()) return;

      // Fabric's internal 2D context must be attached before loading.
      if (!(canvas as any).contextContainer) {
        console.warn("[useCanvasInit] Fabric ctx not ready, skipping hydration");
        return;
      }
      hydratedRef.current = true;

      const { initialData: data, onNodesLoaded: loadNodes, onReady: ready, hasExternalNodes: external, pushHistory: push } = latest.current;
      const hasCanvas = !!data?.canvas;
      const hasNodes  = !!data?.nodes?.length;

      if (hasCanvas || hasNodes || external) {
        isRestoringRef.current = true;

        if (hasCanvas) {
          try {
            await canvas.loadFromJSON(JSON.parse(data!.canvas!));
            if (isGone()) return; // dispose may have run during await
            canvas.renderAll();
          } catch (err) {
            console.error("[useCanvasInit] Canvas load failed:", err);
          }
        }
        push(JSON.stringify(canvas.toJSON()));

        if (hasNodes) loadNodes(data!.nodes!);

        isRestoringRef.current = false;
        ready?.();
      } else {
        addWelcomeContent(canvas, "https://res.cloudinary.com/dqyjffc9q/image/upload/v1773420161/easyflow-logo_nbpfd7.png");
        push(JSON.stringify(canvas.toJSON()));
        ready?.();
      }
    };

    // Double rAF ensures Fabric's internal ctx is fully attached:
    // raf1 fires before the next paint, raf2 after it.
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => { hydrateCanvas(); });
    });

    return () => {
      disposed = true;
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [canvasVersion, isLoadingData]);
};
