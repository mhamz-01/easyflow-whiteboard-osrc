// Switches the Fabric canvas drawing mode, cursor style, and per-object interactivity when the active tool changes.

import { useEffect, RefObject } from "react";
import { Canvas, Circle } from "fabric";
import { calculateDashArray } from "../lib/fabric-utils";
import * as fabric from "fabric";
import { useWhiteboardStore } from "../store/whiteboard-store";
import { isConnector } from "../lib/fabric-connector";

interface UseToolManagerProps {
  fabricCanvas: RefObject<Canvas | null>;
  activeTool: string;
  toolOptions: any;
  eraserTraceRef: RefObject<Circle | null>;
  eraserPathRef: RefObject<fabric.Path | null>;
  eraserPathPointsRef: RefObject<string[]>;
  eraserTargetsRef: RefObject<Set<any>>;
}

export const useToolManager = ({
  fabricCanvas,
  activeTool,
  toolOptions,
  eraserTraceRef,
  eraserPathRef,
  eraserPathPointsRef,
  eraserTargetsRef,
}: UseToolManagerProps) => {
  const editable = useWhiteboardStore((s) => s.editable);

  useEffect(() => {
    const canvas = fabricCanvas.current;
    if (!canvas) return;

    // Clean up eraser trace when switching tools
    if (activeTool !== "eraser" && eraserTraceRef.current) {
      canvas.remove(eraserTraceRef.current);
      eraserTraceRef.current = null;
      eraserTargetsRef.current.clear();

      if (eraserPathRef.current) {
        canvas.remove(eraserPathRef.current);
        eraserPathRef.current = null;
        eraserPathPointsRef.current = [];
      }
    }

    // Read-only lockdown — regardless of activeTool, no object may be
    // selected, moved, resized, deleted, or drawn into while not editable.
    if (!editable) {
      canvas.isDrawingMode = false;
      canvas.selection = false;
      canvas.defaultCursor = "default";
      canvas.hoverCursor = "default";
      canvas.discardActiveObject();
      canvas.forEachObject((obj) => {
        obj.selectable = false;
        obj.evented = false;
      });
      canvas.renderAll();
      return;
    }

    switch (activeTool) {
      case "select":
        canvas.isDrawingMode = false;
        canvas.selection = true;
        canvas.defaultCursor = "default";
        canvas.hoverCursor = "move";
        canvas.forEachObject((obj) => {
          obj.selectable = true;
          obj.evented = true;
          obj.hoverCursor = isConnector(obj) ? "pointer" : "move";
        });
        break;

      case "pan":
        canvas.isDrawingMode = false;
        canvas.selection = false;
        canvas.defaultCursor = "grab";
        canvas.hoverCursor = "grab";
        canvas.forEachObject((obj) => {
          obj.selectable = false;
          obj.evented = false;
        });
        break;

      case "pen":
        canvas.isDrawingMode = true;
        canvas.selection = false;
        canvas.defaultCursor = "crosshair";
        canvas.hoverCursor = "crosshair";

        if (canvas.freeDrawingBrush) {
          canvas.freeDrawingBrush.color = toolOptions.pen.color;
          canvas.freeDrawingBrush.width = toolOptions.pen.strokeWidth;

          if (toolOptions.pen.strokeDashArray) {
            const dynamicDashArray = calculateDashArray(
              toolOptions.pen.strokeDashArray,
              toolOptions.pen.strokeWidth
            );
            canvas.freeDrawingBrush.strokeDashArray = dynamicDashArray || null;
          } else {
            canvas.freeDrawingBrush.strokeDashArray = null;
          }
        }

        canvas.forEachObject((obj) => {
          obj.selectable = false;
          obj.evented = false;
        });
        break;

      case "eraser":
        canvas.isDrawingMode = false;
        canvas.selection = false;
        canvas.defaultCursor = "none";
        canvas.hoverCursor = "none";
        if (eraserTraceRef.current) {
          eraserTraceRef.current.set({ visible: false });
        }
        canvas.forEachObject((obj) => {
          obj.selectable = false;
          obj.evented = true;
        });
        break;

      case "text":
        canvas.isDrawingMode = false;
        canvas.selection = false;
        canvas.defaultCursor = "text";
        canvas.hoverCursor = "text";
        canvas.forEachObject((obj) => {
          obj.selectable = false;
          obj.evented = false;
        });
        break;

      // useConnectors owns all pointer input for this tool.
      case "connector":
      case "rectangle":
      case "circle":
      case "line":
      case "frame":
      case "arrow":
        canvas.isDrawingMode = false;
        canvas.selection = false;
        canvas.defaultCursor = "crosshair";
        canvas.hoverCursor = "crosshair";
        canvas.forEachObject((obj) => {
          obj.selectable = false;
          obj.evented = false;
        });
        break;

      default:
        canvas.isDrawingMode = false;
        canvas.selection = true;
        canvas.defaultCursor = "default";
        canvas.hoverCursor = "move";
    }

    canvas.renderAll();
  }, [
    activeTool,
    toolOptions,
    fabricCanvas,
    eraserTraceRef,
    eraserPathRef,
    eraserPathPointsRef,
    eraserTargetsRef,
    editable,
  ]);
};
