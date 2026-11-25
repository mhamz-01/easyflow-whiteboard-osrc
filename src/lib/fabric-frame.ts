// Custom Fabric.js Frame shape — a white bordered Rect that is always sent behind other objects when placed.

import { Rect } from "fabric";

export class Frame extends Rect {
  static type = "frame";
  
  constructor(options: any = {}) {
    super({
      ...options,
      rx: 0,
      ry: 0,
      fill: "#FFFFFF",
      stroke: "#E5E7EB", // Light gray border
      strokeWidth: 1,
      shadow: {
        color: "rgba(0,0,0,0.1)",
        blur: 4,
        offsetX: 0,
        offsetY: 2,
      },
    });
  }

  // Override to ensure frames stay behind other objects
  _renderControls(ctx: CanvasRenderingContext2D) {
    super._renderControls(ctx);
  }
}