// Applies the current text tool options (font, size, weight, color, alignment) to any selected IText object in real time.

import { useEffect, RefObject } from "react";
import { Canvas, FabricObject } from "fabric";

interface UseTextStyleProps {
  fabricCanvas: RefObject<Canvas | null>;
  toolOptions: any;
}

export const useTextStyle = ({ fabricCanvas, toolOptions }: UseTextStyleProps) => {
  useEffect(() => {
    const canvas = fabricCanvas.current;
    if (!canvas) return;

    const activeObject = canvas.getActiveObject();
    if (!activeObject) return;

    const updateTextStyle = (obj: FabricObject) => {
      if (obj.type !== "i-text" && obj.type !== "text") return;

      const options = toolOptions.text;

      obj.set({
        fontSize: options.fontSize,
        fontFamily: options.fontFamily,
        fontWeight: options.fontWeight,
        fill: options.color,
        textAlign: options.textAlign,
      });

      obj.dirty = true;
    };

    if (activeObject.type === "activeSelection") {
      const objects = (activeObject as any).getObjects();
      objects.forEach((obj: FabricObject) => updateTextStyle(obj));
    } else {
      updateTextStyle(activeObject);
    }

    canvas.requestRenderAll();
  }, [toolOptions.text, fabricCanvas]);
};
