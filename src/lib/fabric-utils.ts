// Fabric.js utility functions — canvas setup, shape drawing helpers, text/image insertion, and the welcome animation.

import {
  Canvas, FabricObject, Rect, Text, Circle, Line,
  Group, IText, FabricImage, Path, util,
} from "fabric";
import { Frame } from "./fabric-frame";
import { PencilBrush } from "fabric";
import { INK } from "./design-tokens";
import { useWhiteboardStore } from "../store/whiteboard-store";

// ── Canvas initialization ─────────────────────────────────────────────────────

export const initializeFabricCanvas = (canvas: Canvas) => {
  FabricObject.prototype.set({
    transparentCorners: false,
    borderColor:  "#3b82f6",
    cornerColor:  "#3b82f6",
    cornerSize:   8,
    cornerStyle:  "circle",
    padding:      4,
  });

  // Object caching — composites complex objects into a cached bitmap.
  // Dramatically reduces repaint cost for objects with shadows, gradients, etc.
  FabricObject.prototype.objectCaching = true;

  canvas.freeDrawingBrush = new PencilBrush(canvas);
  return canvas;
};

// ── updateDrawingObject ───────────────────────────────────────────────────────

export const updateDrawingObject = (
  shape:        FabricObject,
  toolType:     string,
  startPoint:   { x: number; y: number },
  currentPoint: { x: number; y: number }
) => {
  switch (toolType) {
    case "rectangle":
    case "frame": {
      const rect   = shape as Rect;
      const dx     = currentPoint.x - startPoint.x;
      const dy     = currentPoint.y - startPoint.y;
      const strokeW = rect.strokeWidth || 0;

      rect.set({
        left:   startPoint.x + dx / 2,
        top:    startPoint.y + dy / 2,
        width:  Math.max(0, Math.abs(dx) - strokeW),
        height: Math.max(0, Math.abs(dy) - strokeW),
        originX: "center",
        originY: "center",
      });
      // ── PERF FIX 1: Single setCoords() call ──────────────────────────────
      // Old code called setCoords() inside each case AND again at the bottom
      // of the function — double call on every mousemove during drawing.
      rect.setCoords();
      return; // early return skips the bottom setCoords()
    }

    case "circle": {
      const circle = shape as Circle;
      const dx     = currentPoint.x - startPoint.x;
      const dy     = currentPoint.y - startPoint.y;
      const radius = Math.sqrt(dx * dx + dy * dy) / 2;

      circle.set({
        left:    startPoint.x + dx / 2,
        top:     startPoint.y + dy / 2,
        radius:  Math.abs(radius),
        originX: "center",
        originY: "center",
      });
      circle.setCoords();
      return;
    }

    case "line":
    case "arrow": {
      if (shape instanceof Line) {
        shape.set({
          x1: startPoint.x, y1: startPoint.y,
          x2: currentPoint.x, y2: currentPoint.y,
        });
      }
      shape.setCoords();
      return;
    }
  }
};

// ── deleteSelectedObjects ─────────────────────────────────────────────────────

export const deleteSelectedObjects = (canvas: Canvas) => {
  const activeObjects = canvas.getActiveObjects();
  if (!activeObjects.length) return;
  activeObjects.forEach((obj) => canvas.remove(obj));
  canvas.discardActiveObject();
  // ── PERF FIX 2: requestRenderAll instead of renderAll ─────────────────────
  canvas.requestRenderAll();
};

// ── Export / Import ───────────────────────────────────────────────────────────

export const exportCanvasToJSON = (_canvas: Canvas) => {
  // Intentionally left as a no-op stub — implement when needed
};

export const importCanvasFromJSON = (canvas: Canvas, json: string, callback?: () => void) => {
  canvas.loadFromJSON(json).then(() => {
    canvas.requestRenderAll(); // PERF FIX 3
    if (callback) callback();
  });
};

export const exportCanvasToImage = (canvas: Canvas, format: "png" | "jpeg" = "png") => {
  return canvas.toDataURL({ format, quality: 1, multiplier: 2 });
};

// ── calculateDashArray ────────────────────────────────────────────────────────

export const calculateDashArray = (
  strokeDashArray: number[] | null,
  strokeWidth: number
): number[] | undefined => {
  if (!strokeDashArray) return undefined;
  const multiplier = Math.max(strokeWidth, 1);
  return strokeDashArray.map((v) => v * multiplier);
};

// ── addText ───────────────────────────────────────────────────────────────────

export const addText = (
  canvas: Canvas,
  options: {
    text?: string; x?: number; y?: number;
    fontSize?: number; fontWeight?: string;
    fontFamily?: string; color?: string; textAlign?: string;
  }
) => {
  const text = new IText(options.text || "Double click to edit", {
    left:       options.x || 100,
    top:        options.y || 100,
    fontSize:   options.fontSize   || 16,
    fontFamily: options.fontFamily || "Arial",
    fontWeight: options.fontWeight || "400",
    fill:       options.color      || "#000000",
  });

  canvas.add(text);
  canvas.setActiveObject(text);
  canvas.requestRenderAll(); // PERF FIX 4
  text.enterEditing();
  text.selectAll();
  return text;
};

// ── addImageToCanvas ──────────────────────────────────────────────────────────

export const addImageToCanvas = async (canvas: Canvas, url: string) => {
  if (!canvas) return;

  const vpt   = canvas.viewportTransform;
  const zoom  = canvas.getZoom();
  const centerX = (-vpt[4] + canvas.width / 2) / zoom;
  const centerY = (-vpt[5] + canvas.height / 2) / zoom;

  try {
    const img = await FabricImage.fromURL(url);
    const targetHeight = (canvas.height / zoom) * 0.4;
    img.scaleToHeight(targetHeight);
    img.set({ left: centerX, top: centerY, originX: "center", originY: "center", padding: 10 });
    canvas.add(img);
    canvas.setActiveObject(img);
    canvas.requestRenderAll(); // PERF FIX 5
    return img;
  } catch (error) {
    console.error("Image load failed", error);
  }
};

// ── clearCanvas ───────────────────────────────────────────────────────────────

export const clearCanvas = (canvas: Canvas) => {
  canvas.clear();
  canvas.backgroundColor = "transparent";
  canvas.requestRenderAll(); // PERF FIX 6
};

// ── zoomCanvas ────────────────────────────────────────────────────────────────

export const zoomCanvas = (canvas: Canvas, zoomLevel: number) => {
  canvas.setZoom(zoomLevel);
  canvas.requestRenderAll(); // PERF FIX 7
};

// ── fitCanvasToObjects ────────────────────────────────────────────────────────

export const fitCanvasToObjects = (canvas: Canvas) => {
  const objects = canvas.getObjects();
  if (!objects.length) return;

  // ── PERF FIX 8: Use getBoundingRect instead of creating a Group ───────────
  // Old code: new Group(objects) — instantiates a full Fabric Group object
  // with layout recalculation for every object just to get bounds. O(n) object
  // creation + layout for a measurement-only operation.
  // getBoundingRect() computes bounds from existing coords — no allocation.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const obj of objects) {
    const bounds = obj.getBoundingRect();
    if (bounds.left            < minX) minX = bounds.left;
    if (bounds.top             < minY) minY = bounds.top;
    if (bounds.left + bounds.width  > maxX) maxX = bounds.left + bounds.width;
    if (bounds.top  + bounds.height > maxY) maxY = bounds.top  + bounds.height;
  }

  const contentW = maxX - minX;
  const contentH = maxY - minY;
  const padding  = 100;

  const zoom = Math.min(
    canvas.getWidth()  / (contentW + padding),
    canvas.getHeight() / (contentH + padding)
  );

  canvas.setZoom(zoom);

  // Center the content
  const vpt = canvas.viewportTransform;
  if (vpt) {
    vpt[4] = (canvas.getWidth()  - contentW * zoom) / 2 - minX * zoom;
    vpt[5] = (canvas.getHeight() - contentH * zoom) / 2 - minY * zoom;
  }

  canvas.requestRenderAll();
};

// ── addWelcomeContent ─────────────────────────────────────────────────────────

export const addWelcomeContent = async (canvas: Canvas, logoUrl: string) => {
  const centerX = canvas.getWidth()  / 2;
  const centerY = canvas.getHeight() / 2;

  const logoImg = await FabricImage.fromURL(logoUrl, { crossOrigin: "anonymous" });
  const scale   = 60 / logoImg.width;
  logoImg.set({ scaleX: scale, scaleY: scale, originX: "center", originY: "center", top: -120 });

  const mainTitle = new Text("EasyFlow", {
    top: -20, fontSize: 84, fontFamily: "'cursive', 'Segoe UI', Roboto, sans-serif",
    fontWeight: "700", fill: "#029AFF", charSpacing: -20, originX: "center",
  });

  const subTitle = new Text("Whiteboard", {
    top: 55, fontSize: 38, fontFamily: "'Inter', 'Segoe UI', Roboto, sans-serif",
    fontWeight: "300", fill: INK[useWhiteboardStore.getState().theme], originX: "center",
  });

  const hint = new Text("SELECT A TOOL TO START CREATING", {
    top: 110, fontSize: 12, fontFamily: "monospace",
    fontWeight: "600", fill: "#9ca3af", charSpacing: 200, originX: "center",
  });

  const heroGroup = new Group([logoImg, mainTitle, subTitle, hint], {
    left: centerX, top: centerY + 20,
    originX: "center", originY: "center",
    selectable: false, evented: false, opacity: 0,
  });

  (heroGroup as any).id = "welcome-hero";
  canvas.add(heroGroup);

  heroGroup.animate({ opacity: 1, top: centerY }, {
    duration: 1200,
    easing:   util.ease.easeOutQuart,
    onChange: () => canvas.requestRenderAll(),
  });
};