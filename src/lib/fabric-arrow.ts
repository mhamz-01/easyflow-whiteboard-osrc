// Custom Fabric.js Arrow shape — extends Line with a filled triangle arrowhead rendered at the endpoint.

import { Line, classRegistry, TClassProperties, FabricObjectProps, SerializedLineProps } from "fabric";

export class Arrow extends Line {
  static type = "arrow";

  // Use the specific tuple type Fabric expects for Line
  // This solves: "Target requires 4 element(s) but source may have fewer"
  constructor(points: [number, number, number, number], options?: any) {
    super(points, options);
  }

  _render(ctx: CanvasRenderingContext2D) {
    super._render(ctx);

    const p = this.calcLinePoints();
    const dx = p.x2 - p.x1;
    const dy = p.y2 - p.y1;
    const angle = Math.atan2(dy, dx);

    const headLength = 15;
    const headWidth = 10;

    ctx.save();
    ctx.translate(p.x2, p.y2);
    ctx.rotate(angle);

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-headLength, headWidth / 2);
    ctx.lineTo(-headLength, -headWidth / 2);
    ctx.closePath();

    ctx.fillStyle = (this.stroke as string) || "#000000";
    ctx.fill();

    ctx.restore();
  }

  /**
   * Fixes the Type signature mismatch.
   * K extends keyof T = never ensures compatibility with the base class generics.
   */
  toObject<
    T extends Omit<Partial<FabricObjectProps> & TClassProperties<this>, keyof SerializedLineProps>,
    K extends keyof T = never
  >(propertiesToInclude?: K[]): Pick<T, K> & SerializedLineProps {
    return super.toObject(propertiesToInclude);
  }

  /**
   * Deserialization support
   */
  static fromObject(object: any): Promise<Arrow> {
    // Explicitly cast to the required tuple type [number, number, number, number]
    const points: [number, number, number, number] = [
      object.x1,
      object.y1,
      object.x2,
      object.y2,
    ];
    // `type` is read-only on instances; passing it back in only triggers a Fabric warning.
    const { type: _type, ...options } = object;
    return Promise.resolve(new Arrow(points, options));
  }
}

classRegistry.setClass(Arrow, "arrow");