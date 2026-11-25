// Custom Fabric.js BidirectionalArrow shape — extends Line with filled arrowheads at both endpoints.

import {
    Line,
    classRegistry, 
    TClassProperties, 
    FabricObjectProps, 
    SerializedLineProps,
    ObjectEvents // Import the missing generic
  } from "fabric";
  
  // We must include the third generic <ObjectEvents> to match the Line class signature perfectly
  export class BidirectionalArrow extends Line<Partial<FabricObjectProps>, SerializedLineProps, ObjectEvents> {
    static override type = "bidirectional-arrow";
    
    public headSize: number;
  
    constructor(points: [number, number, number, number], options?: any) {
      super(points, options);
      this.headSize = options?.headSize || 12;
    }
  
    static override cacheProperties = [...Line.cacheProperties, "headSize"];
  
    _render(ctx: CanvasRenderingContext2D) {
      super._render(ctx);
  
      const p = this.calcLinePoints();
      const dx = p.x2 - p.x1;
      const dy = p.y2 - p.y1;
      const angle = Math.atan2(dy, dx);
      const head = this.headSize;
  
      ctx.save();
      ctx.fillStyle = (this.stroke as string) || "#000000";
  
      // End Arrowhead
      ctx.save();
      ctx.translate(p.x2, p.y2);
      ctx.rotate(angle);
      this._drawArrowHead(ctx, head);
      ctx.restore();
  
      // Start Arrowhead
      ctx.save();
      ctx.translate(p.x1, p.y1);
      ctx.rotate(angle + Math.PI);
      this._drawArrowHead(ctx, head);
      ctx.restore();
  
      ctx.restore();
    }
  
    private _drawArrowHead(ctx: CanvasRenderingContext2D, size: number) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-size, size / 2);
      ctx.lineTo(-size, -size / 2);
      ctx.closePath();
      ctx.fill();
    }
  
    /**
     * Signature must be exact. Casting the return to 'any' allows us to bypass 
     * the Pick/Omit complexity of the Fabric v6 base type.
     */
    override toObject<
      T extends Omit<Partial<FabricObjectProps> & TClassProperties<this>, keyof SerializedLineProps>,
      K extends keyof T = never
    >(propertiesToInclude?: K[]): Pick<T, K> & SerializedLineProps {
      return {
        ...super.toObject(propertiesToInclude as any),
        headSize: this.headSize,
      } as any;
    }
  
    /**
     * Static side inheritance requires the return to be compatible with Promise<Line>.
     * Casting the result to Promise<any> satisfies the static extension check.
     */
    static override fromObject(object: any): Promise<any> {
      const points: [number, number, number, number] = [
        object.x1,
        object.y1,
        object.x2,
        object.y2,
      ];
      // `type` is read-only on instances; passing it back in only triggers a Fabric warning.
    const { type: _type, ...options } = object;
    return Promise.resolve(new BidirectionalArrow(points, options));
    }
  }
  
  classRegistry.setClass(BidirectionalArrow, "bidirectional-arrow");