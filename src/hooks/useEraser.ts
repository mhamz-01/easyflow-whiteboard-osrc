// Eraser tool — renders a brush cursor and trail path, then deletes any Fabric objects intersected on mouse-up.

import { RefObject } from "react";
import { Canvas, Circle, FabricObject } from "fabric";
import * as fabric from "fabric";

interface UseEraserProps {
  fabricCanvas: RefObject<Canvas | null>;
  activeTool: string;
  toolOptions: any;
  eraserTraceRef: RefObject<Circle | null>;
  eraserTargetsRef: RefObject<Set<FabricObject>>;
  eraserActiveRef: RefObject<boolean>;
  eraserPathRef: RefObject<fabric.Path | null>;
  eraserPathPointsRef: RefObject<string[]>;
  suppressHistoryRef: RefObject<boolean>;
  pushHistory: (state: string) => void;
}

export const useEraser = ({
  fabricCanvas,
  activeTool,
  toolOptions,
  eraserTraceRef,
  eraserTargetsRef,
  eraserActiveRef,
  eraserPathRef,
  eraserPathPointsRef,
  suppressHistoryRef,
  pushHistory,
}: UseEraserProps) => {
  const handleMouseOver = () => {
    if (activeTool === "eraser" && eraserTraceRef.current) {
      eraserTraceRef.current.set({ visible: true });
      fabricCanvas.current?.renderAll();
    }
  };

  const handleMouseOut = () => {
    if (activeTool === "eraser" && eraserTraceRef.current) {
      eraserTraceRef.current.set({ visible: false });
      fabricCanvas.current?.renderAll();
    }
  };

  const handleEraserDown = () => {
    if (activeTool !== "eraser") return false;
    eraserActiveRef.current = true;
    suppressHistoryRef.current = true;
    return true;
  };

  const handleEraserMove = (pointer: { x: number; y: number }) => {
    const canvas = fabricCanvas.current;
    if (!canvas || activeTool !== "eraser") return;

    // Create or update trace circle
    if (!eraserTraceRef.current) {
      eraserTraceRef.current = new Circle({
        radius: toolOptions.eraser.size / 1.5,
        fill: "rgba(195, 195, 195, 0.2)",
        stroke: "#e2e2e0",
        strokeWidth: 2,
        selectable: false,
        evented: false,
        originX: "center",
        originY: "center",
        excludeFromExport: true,
      });
      canvas.add(eraserTraceRef.current);
    }

    if (!eraserTraceRef.current.visible) {
      eraserTraceRef.current.set({ visible: true });
    }

    eraserTraceRef.current.set({ left: pointer.x, top: pointer.y });
    eraserTraceRef.current.setCoords();
    canvas.bringObjectToFront(eraserTraceRef.current);

    // Smooth continuous trail
    if (eraserActiveRef.current) {
      suppressHistoryRef.current = true;

      if (eraserPathPointsRef.current.length === 0) {
        eraserPathPointsRef.current = [`M ${pointer.x} ${pointer.y}`];

        const path = new fabric.Path(eraserPathPointsRef.current.join(" "), {
          stroke: "rgba(220, 220, 220, 0.7)",
          strokeWidth: toolOptions.eraser.size,
          fill: null,
          selectable: false,
          evented: false,
          strokeLineCap: "round",
          strokeLineJoin: "round",
          opacity: 1,
          excludeFromExport: true,
        });

        canvas.add(path);
        eraserPathRef.current = path;
      } else {
        eraserPathPointsRef.current.push(`L ${pointer.x} ${pointer.y}`);
        const pathString = eraserPathPointsRef.current.join(" ");

        if (eraserPathRef.current) {
          canvas.remove(eraserPathRef.current);
        }

        const path = new fabric.Path(pathString, {
          stroke: "rgba(53, 53, 53, 0.7)",
          strokeWidth: toolOptions.eraser.size,
          fill: null,
          selectable: false,
          evented: false,
          strokeLineCap: "round",
          strokeLineJoin: "round",
          opacity: 1,
          excludeFromExport: true,
        });

        canvas.add(path);
        eraserPathRef.current = path;
      }

      canvas.bringObjectToFront(eraserTraceRef.current!);
    }

    // Find objects under eraser
    const previousTargets = new Set(eraserTargetsRef.current);
    eraserTargetsRef.current.clear();

    canvas.forEachObject((obj) => {
      if (obj === eraserTraceRef.current) return;
      if (obj === eraserPathRef.current) return;

      if (obj.intersectsWithObject(eraserTraceRef.current!)) {
        eraserTargetsRef.current.add(obj);

        if (eraserActiveRef.current && obj.opacity !== 0.3) {
          obj.set({ opacity: 0.3 });
        }
      } else if (previousTargets.has(obj)) {
        obj.set({ opacity: 1 });
      }
    });

    canvas.renderAll();
  };

  const handleEraserUp = () => {
    const canvas = fabricCanvas.current;
    if (!canvas || activeTool !== "eraser" || !eraserActiveRef.current)
      return false;

    eraserActiveRef.current = false;

    // Restore opacity
    canvas.forEachObject((obj) => {
      if (obj.opacity === 0.3) obj.set({ opacity: 1 });
    });

    // Remove trail
    if (eraserPathRef.current) {
      canvas.remove(eraserPathRef.current);
      eraserPathRef.current = null;
      eraserPathPointsRef.current = [];
    }

    // Delete targeted objects
    eraserTargetsRef.current.forEach((obj) => {
      canvas.remove(obj);
    });

    eraserTargetsRef.current.clear();
    canvas.renderAll();

    // Save history
    suppressHistoryRef.current = false;
    pushHistory(JSON.stringify(canvas.toJSON()));
    return true;
  };

  return {
    handleMouseOver,
    handleMouseOut,
    handleEraserDown,
    handleEraserMove,
    handleEraserUp,
  };
};
