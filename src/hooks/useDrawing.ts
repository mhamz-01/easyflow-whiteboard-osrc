// Provides stable mouse-down/move/up handlers for drawing shapes (rect, circle, line, arrow, frame, text) via drag.

import { useRef, RefObject } from "react";
import { Canvas, FabricObject, TPointerEventInfo, Rect, Circle, Line } from "fabric";
import { Frame } from "../lib/fabric-frame";
import { Arrow } from "../lib/fabric-arrow";
import { calculateDashArray, updateDrawingObject, addText } from "../lib/fabric-utils";
import { useWhiteboardStore } from "../store/whiteboard-store";

interface UseDrawingProps {
  fabricCanvas:       RefObject<Canvas | null>;
  activeTool:         string;
  toolOptions:        any;
  isDrawingRef:       RefObject<boolean>;
  startPointRef:      RefObject<{ x: number; y: number } | null>;
  currentShapeRef:    RefObject<FabricObject | null>;
  suppressHistoryRef: RefObject<boolean>;
  pushHistory:        (state: string) => void;
  addCanvasObject:    (obj: FabricObject) => void;
}

export const useDrawing = ({
  fabricCanvas,
  activeTool,
  toolOptions,
  isDrawingRef,
  startPointRef,
  currentShapeRef,
  suppressHistoryRef,
  pushHistory,
  addCanvasObject,
}: UseDrawingProps) => {

  // ── PERF FIX 1: Stable refs for all props ────────────────────────────────
  // These plain handler functions are recreated every render. useMouseHandlers
  // puts drawingHandlers in its deps array, causing all 5 canvas listeners to
  // re-register on every render. Wrapping in refs makes the returned object
  // referentially stable — useMouseHandlers can safely use [] deps.
  const activeToolRef        = useRef(activeTool);
  const toolOptionsRef       = useRef(toolOptions);
  const pushHistoryRef       = useRef(pushHistory);
  const addCanvasObjectRef   = useRef(addCanvasObject);

  activeToolRef.current      = activeTool;
  toolOptionsRef.current     = toolOptions;
  pushHistoryRef.current     = pushHistory;
  addCanvasObjectRef.current = addCanvasObject;

  // ── Stable handler refs — identity never changes ──────────────────────────
  const handlersRef = useRef({
    handleMouseDown: (opt: TPointerEventInfo) => {
      const canvas = fabricCanvas.current;
      if (!canvas) return;

      const tool    = activeToolRef.current;
      const options = toolOptionsRef.current;
      const pointer = canvas.getScenePoint(opt.e as MouseEvent);

      if (opt.target || canvas.getActiveObject()) return;

      // Text tool
     // In handleMouseDown, replace the text tool block:

     if (tool === "text") {
      const textObj = addText(canvas, {
        x:          pointer.x,
        y:          pointer.y,
        fontSize:   options.text.fontSize,
        fontFamily: options.text.fontFamily,
        fontWeight: options.text.fontWeight,
        color:      options.text.color,
        textAlign:  options.text.textAlign,
      });
      pushHistoryRef.current(JSON.stringify(canvas.toJSON()));
    
      // Switch tool immediately — don't wait for editing:exited
      useWhiteboardStore.getState().setActiveTool("select");
    
      // Force cursor reset on the actual canvas DOM element
      // because browser overrides Fabric's cursor during IText editing
      const canvasEl = canvas.getElement();
      if (canvasEl) canvasEl.style.cursor = "default";
    
      // Also reset when editing ends in case browser re-applies text cursor
      if (textObj) {
        textObj.once("editing:exited", () => {
          canvas.defaultCursor = "default";
          canvas.hoverCursor   = "move";
          const el = canvas.getElement();
          if (el) el.style.cursor = "default";
        });
      }
      return;
    }

      if (!["rectangle", "circle", "frame", "line", "arrow"].includes(tool)) return;

      suppressHistoryRef.current = true;
      isDrawingRef.current       = true;
      startPointRef.current      = { x: pointer.x, y: pointer.y };

      let shape: FabricObject | null = null;

      switch (tool) {
        case "rectangle":
          shape = new Rect({
            left: pointer.x, top: pointer.y, width: 1, height: 1,
            fill:            options.rectangle.fillColor === "transparent" ? "transparent" : options.rectangle.fillColor,
            stroke:          options.rectangle.strokeColor,
            strokeWidth:     options.rectangle.strokeWidth,
            strokeDashArray: calculateDashArray(options.rectangle.strokeDashArray, options.rectangle.strokeWidth),
            rx: 5, ry: 5,
            strokeLineCap: "round", strokeLineJoin: "round",
            selectable: false,
          });
          break;

        case "circle":
          shape = new Circle({
            left: pointer.x, top: pointer.y, radius: 1,
            fill:            options.circle.fillColor === "transparent" ? "transparent" : options.circle.fillColor,
            stroke:          options.circle.strokeColor,
            strokeWidth:     options.circle.strokeWidth,
            strokeDashArray: options.circle.strokeDashArray ? [...options.circle.strokeDashArray] : undefined,
            selectable:      false,
          });
          break;

        case "frame":
          shape = new Frame({
            left: pointer.x, top: pointer.y, width: 1, height: 1,
            stroke:          options.frame.strokeColor,
            strokeWidth:     options.frame.strokeWidth,
            strokeDashArray: options.frame.strokeDashArray ? [...options.frame.strokeDashArray] : undefined,
            fill:            options.frame.fillColor,
            selectable:      false,
          });
          break;

        case "line":
          shape = new Line([pointer.x, pointer.y, pointer.x, pointer.y], {
            stroke:          options.line.strokeColor,
            strokeWidth:     options.line.strokeWidth,
            strokeDashArray: options.line.strokeDashArray || undefined,
            selectable:      false,
          });
          break;

        case "arrow":
          shape = new Arrow([pointer.x, pointer.y, pointer.x, pointer.y], {
            stroke:          options.arrow.strokeColor,
            strokeWidth:     options.arrow.strokeWidth,
            strokeDashArray: options.arrow.strokeDashArray || undefined,
            selectable:      false,
          });
          break;
      }

      if (shape) {
        canvas.add(shape);
        currentShapeRef.current = shape;
        // ── PERF FIX 2: requestRenderAll instead of renderAll ─────────────
        // renderAll() is synchronous — blocks the main thread immediately.
        // requestRenderAll() schedules the paint on Fabric's rAF loop.
        canvas.requestRenderAll();
      }
    },

    handleMouseMove: (opt: TPointerEventInfo) => {
      const canvas = fabricCanvas.current;
      if (!canvas || !isDrawingRef.current || !currentShapeRef.current || !startPointRef.current) return;

      const pointer = canvas.getScenePoint(opt.e as MouseEvent);
      updateDrawingObject(currentShapeRef.current, activeToolRef.current, startPointRef.current, pointer);

      // ── PERF FIX 3: requestRenderAll instead of renderAll ─────────────────
      // This fires on every mousemove during drawing — the single most frequent
      // call site. Synchronous renderAll() here directly causes frame drops.
      canvas.requestRenderAll();
    },

    handleMouseUp: () => {
      const canvas = fabricCanvas.current;
      if (!canvas || !isDrawingRef.current || !currentShapeRef.current) return;

      const shape = currentShapeRef.current;
      shape.set({ selectable: true, evented: true });

      if (shape instanceof Frame) canvas.sendObjectToBack(shape);

      addCanvasObjectRef.current(shape);
      suppressHistoryRef.current = false;
      pushHistoryRef.current(JSON.stringify(canvas.toJSON()));

      isDrawingRef.current    = false;
      startPointRef.current   = null;
      currentShapeRef.current = null;

      useWhiteboardStore.getState().setActiveTool("select");
      canvas.discardActiveObject();

      // ── PERF FIX 4: Single requestRenderAll instead of two renderAll() ────
      // Old code called renderAll() twice (after discardActiveObject + at end).
      // One requestRenderAll() covers both.
      canvas.requestRenderAll();
    },
  });

  // Return stable object reference — identity never changes across renders
  return handlersRef.current;
};