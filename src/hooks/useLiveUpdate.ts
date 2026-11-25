// Live-previews tool option changes (fill, stroke, opacity, dash) on whichever Fabric object is currently selected.

import { useEffect, RefObject } from "react";
import { Canvas, FabricObject, FabricImage } from "fabric";
import { Frame } from "../lib/fabric-frame";
import { calculateDashArray } from "../lib/fabric-utils";
import { Connector, refreshConnectors } from "../lib/fabric-connector";

interface UseLiveUpdateProps {
  fabricCanvas: RefObject<Canvas | null>;
  toolOptions: any;
}

export const useLiveUpdate = ({ fabricCanvas, toolOptions }: UseLiveUpdateProps) => {
  useEffect(() => {
    const canvas = fabricCanvas.current;
    if (!canvas) return;

    // ← KEY FIX: This should only run when toolOptions CHANGES
    // Not when selection changes!
    
    const activeObject = canvas.getActiveObject();
    if (!activeObject) return;

    const updateObjectStyle = (obj: FabricObject) => {
      if (obj instanceof Connector) {
        const o = toolOptions.connector;
        obj.set({
          stroke:          o.strokeColor,
          strokeWidth:     o.strokeWidth,
          strokeDashArray: calculateDashArray(o.strokeDashArray, o.strokeWidth) ?? null,
          lineType:        o.lineType,
          startArrow:      o.startArrow,
          endArrow:        o.endArrow,
        });
        // Line type and stroke width change the route and its bounds.
        refreshConnectors(canvas);
        return;
      }

      let options: any = null;

      if (obj.type === "rect") options = toolOptions.rectangle;
      else if (obj.type === "circle") options = toolOptions.circle;
      else if (obj instanceof Frame) options = toolOptions.frame;
      else if (obj.type === "line") options = toolOptions.line;
      else if (obj.type === "path") options = toolOptions.pen;
      else if (obj instanceof FabricImage || obj.type === "image") options = toolOptions.image;
      else if (obj.type === "arrow" || obj.type === "bidirectional-arrow") options = toolOptions.arrow;

      if (!options) return;

      const update: any = {};

      if (typeof options.opacity === "number") {
        update.opacity = options.opacity;
      }

      if (obj.type !== "image" && !(obj instanceof FabricImage)) {
        if (obj.type === "path") {
          update.stroke = options.color || options.strokeColor;
        } else {
          update.fill = options.fillColor === "transparent" ? "transparent" : options.fillColor;
          update.stroke = options.strokeColor;
        }

        update.strokeWidth = options.strokeWidth;
        update.strokeDashArray = calculateDashArray(options.strokeDashArray, options.strokeWidth);
      }

      obj.set(update);
      obj.setCoords();
      obj.dirty = true;
    };

    if (activeObject.type === "activeSelection") {
      (activeObject as any).getObjects().forEach((obj: FabricObject) => updateObjectStyle(obj));
    } else {
      updateObjectStyle(activeObject);
    }

    canvas.requestRenderAll();
  }, [toolOptions]); // ← REMOVED fabricCanvas from deps - only run when toolOptions changes
};