// Tracks Fabric canvas selection events, syncs object type to the store, and drives the rubber-band selection box for HTML nodes.

import { useEffect, useRef } from "react";
import { Canvas, Rect, FabricObject, FabricImage } from "fabric";
import { Frame } from "../lib/fabric-frame";
import { Arrow } from "../lib/fabric-arrow";
import { BidirectionalArrow } from "../lib/fabric-bidirectional-arrow";
import { useWhiteboardStore } from "../store/whiteboard-store";
import { Connector } from "../lib/fabric-connector";
import { CONNECTOR_DEFAULT_COLOR, INK } from "../lib/design-tokens";

interface UseSelectionProps {
  fabricCanvas: React.RefObject<Canvas | null>;
  activeTool: string;
  canvasZoom: number;
  canvasViewport: { x: number; y: number };
  setSelectionBox: (box: { x1: number; y1: number; x2: number; y2: number } | null) => void;
  setSelectedCanvasObjects: (objects: FabricObject[]) => void;
  isDrawingRef: React.MutableRefObject<boolean>;
  onClearHtmlSelection?: () => void;  // ← add this
}


export const useSelection = ({
  fabricCanvas,
  activeTool,
  setSelectionBox,
  setSelectedCanvasObjects,
  isDrawingRef,
  onClearHtmlSelection,
}: UseSelectionProps) => {
  const setSelectedObjectType = useWhiteboardStore((s) => s.setSelectedObjectType);
  const setActiveTool = useWhiteboardStore((s) => s.setActiveTool);

  // activeTool ref — so effect never re-registers on tool change
  const activeToolRef = useRef(activeTool);
  useEffect(() => { activeToolRef.current = activeTool; }, [activeTool]);

  useEffect(() => {
    const canvas = fabricCanvas.current;
    if (!canvas) return;

    let isSelecting = false;
    let selStart = { x: 0, y: 0 };
    let selRect: Rect | null = null;
    let rafId: number | null = null;

    const onDown = (e: any) => {
      if (activeToolRef.current !== "select" || e.target) return;

      isSelecting = true;

  
      const p = canvas.getScenePoint(e.e);
      selStart = { x: p.x, y: p.y };

      selRect = new Rect({
        left: p.x,
        top: p.y,
        width: 0,
        height: 0,
        fill: "transparent",
        stroke: "transparent",
        strokeWidth: 0,
        selectable: false,
        evented: false,
        visible: false,           // ← hidden, pure coordinate tracker
        excludeFromExport: true,
      });

      canvas.add(selRect);
      canvas.renderAll();
    };

    const onMove = (e: any) => {
      if (!isSelecting || !selRect) return;
      if (rafId !== null) cancelAnimationFrame(rafId);

      rafId = requestAnimationFrame(() => {
        const p = canvas.getScenePoint(e.e);
        const w = p.x - selStart.x;
        const h = p.y - selStart.y;

        selRect!.set({
          left:   w < 0 ? p.x : selStart.x,
          top:    h < 0 ? p.y : selStart.y,
          width:  Math.abs(w),
          height: Math.abs(h),
          // strokeWidth line removed
        });
        selRect!.setCoords();
        canvas.renderAll();

        // ── Read directly from Fabric VPT — always frame-perfect, zero React lag ──
        const vpt  = canvas.viewportTransform!;
        const zoom = vpt[0];  // scaleX
        const vpX  = vpt[4];  // panX
        const vpY  = vpt[5];  // panY

        setSelectionBox({
          x1: Math.min(selStart.x, p.x) * zoom + vpX,
          y1: Math.min(selStart.y, p.y) * zoom + vpY,
          x2: Math.max(selStart.x, p.x) * zoom + vpX,
          y2: Math.max(selStart.y, p.y) * zoom + vpY,
        });
      });
    };

    const onUp = () => {
      if (!isSelecting) return;
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }

      if (selRect) {
        canvas.remove(selRect);
        canvas.renderAll();
        selRect = null;
      }

 
      isSelecting = false;

      setTimeout(() => setSelectionBox(null), 150);
    };

    const onSelected = () => {
      const sel = canvas.getActiveObject();
      if (!sel || isDrawingRef.current) return;

      onClearHtmlSelection?.();

      setSelectedCanvasObjects(
        sel.type === "activeSelection" ? (sel as any).getObjects() : [sel]
      );

      const typeMap: Record<string, string> = {
        rect: "rectangle", circle: "circle", line: "line",
        arrow: "arrow", "bidirectional-arrow": "arrow",
        "i-text": "text", text: "text", path: "pen", image: "image",
      };

      const t = sel instanceof Connector       ? "connector"
              : sel instanceof Frame           ? "frame"
              : sel instanceof FabricImage      ? "image"
              : sel instanceof Arrow            ? "arrow"
              : sel instanceof BidirectionalArrow ? "arrow"
              : typeMap[sel.type] ?? null;

      setSelectedObjectType(t);

      if (t && sel.type !== "activeSelection") {
        const store = useWhiteboardStore.getState();
        
        if (t === "rectangle" && sel.fill) {
          store.setToolOption("rectangle", "fillColor", sel.fill);
          store.setToolOption("rectangle", "strokeColor", sel.stroke || INK[store.theme]);
          store.setToolOption("rectangle", "strokeWidth", sel.strokeWidth || 2);
        } else if (t === "circle" && sel.fill) {
          store.setToolOption("circle", "fillColor", sel.fill);
          store.setToolOption("circle", "strokeColor", sel.stroke || INK[store.theme]);
          store.setToolOption("circle", "strokeWidth", sel.strokeWidth || 2);
        } else if (t === "connector" && sel instanceof Connector) {
          const sw = sel.strokeWidth || 2;
          store.setToolOption("connector", "strokeColor", sel.stroke || CONNECTOR_DEFAULT_COLOR);
          store.setToolOption("connector", "strokeWidth", sw);
          store.setToolOption("connector", "strokeDashArray", sel.strokeDashArray ? sel.strokeDashArray.map((v) => v / Math.max(sw, 1)) : null);
          store.setToolOption("connector", "lineType", sel.lineType);
          store.setToolOption("connector", "startArrow", sel.startArrow);
          store.setToolOption("connector", "endArrow", sel.endArrow);
        }
        // Add for other types as needed...
      }
      
    };

    const onDeselected = () => {
      setSelectedObjectType(null);
      // ── Do NOT touch selectionBox here — onUp owns its lifecycle ──
      setSelectedCanvasObjects([]);

      if (!isDrawingRef.current &&
          activeToolRef.current !== "select" &&
          activeToolRef.current !== "pan") {
        setActiveTool("select");
      }
    };

    canvas.on("selection:created",  onSelected);
    canvas.on("selection:updated",  onSelected);
    canvas.on("selection:cleared",  onDeselected);
    canvas.on("mouse:down",         onDown);
    canvas.on("mouse:move",         onMove);
    canvas.on("mouse:up",           onUp);

    return () => {
      canvas.off("selection:created",  onSelected);
      canvas.off("selection:updated",  onSelected);
      canvas.off("selection:cleared",  onDeselected);
      canvas.off("mouse:down",         onDown);
      canvas.off("mouse:move",         onMove);
      canvas.off("mouse:up",           onUp);
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (selRect) { canvas.remove(selRect); }

    };

  // ── Stable deps only — effect registers once per canvas mount ──
  }, [fabricCanvas, setSelectionBox, setSelectedCanvasObjects, setSelectedObjectType, setActiveTool, isDrawingRef]);
};