// Custom Fabric.js Connector — a line/elbow/curve that binds to other objects by id and re-routes itself when they move.

import {
  Canvas,
  FabricObject,
  Intersection,
  Point,
  classRegistry,
  util,
} from "fabric";
import { blueAlpha, CONNECTOR_DEFAULT_COLOR } from "./design-tokens";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AnchorSide = "top" | "right" | "bottom" | "left";

/** "auto" re-picks the side facing the other end every time the connector re-routes. */
export type ConnectorAnchor = AnchorSide | "auto";

export type ConnectorLineType = "elbow" | "curved" | "straight";

/**
 * One end of a connector. When `id` is set the end is bound to that object and
 * `x`/`y` are just the last resolved position (kept so the JSON stays readable
 * and a missing target degrades to a free end instead of vanishing).
 */
export interface ConnectorEnd {
  id: string | null;
  anchor: ConnectorAnchor | null;
  x: number;
  y: number;
}

type Pt = { x: number; y: number };

export interface ResolvedEnd {
  point: Pt;
  /** Outward direction the line leaves this end along; null for a free end. */
  dir: Pt | null;
}

type Route =
  | { kind: "poly"; pts: Pt[] }
  | { kind: "bezier"; p1: Pt; c1: Pt; c2: Pt; p2: Pt };

// ─── Anchor geometry ──────────────────────────────────────────────────────────

export const ANCHOR_SIDES: AnchorSide[] = ["top", "right", "bottom", "left"];

const SIDE_UNIT: Record<AnchorSide, Pt> = {
  top:    { x: 0,  y: -1 },
  right:  { x: 1,  y: 0 },
  bottom: { x: 0,  y: 1 },
  left:   { x: -1, y: 0 },
};

const len = (p: Pt) => Math.hypot(p.x, p.y);
const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k });
const norm = (p: Pt): Pt => {
  const l = len(p);
  return l < 1e-9 ? { x: 1, y: 0 } : { x: p.x / l, y: p.y / l };
};
/** Snap a direction to the dominant axis — elbow routes only run horizontally/vertically. */
const axisSnap = (p: Pt): Pt =>
  Math.abs(p.x) >= Math.abs(p.y) ? { x: Math.sign(p.x) || 1, y: 0 } : { x: 0, y: Math.sign(p.y) || 1 };

/** Scene-space centre of an object, including any parent group transform. */
export const getObjectCenter = (obj: FabricObject): Pt => {
  const c = obj.getCenterPoint();
  return { x: c.x, y: c.y };
};

/**
 * Midpoint of one side of `obj` in scene space, plus the outward normal.
 * Uses the full transform matrix, so rotated, scaled, flipped and
 * grouped (ActiveSelection) objects all resolve correctly.
 */
export const getAnchorPoint = (obj: FabricObject, side: AnchorSide): ResolvedEnd => {
  const m = obj.calcTransformMatrix();
  const sw = obj.stroke && !obj.strokeUniform ? obj.strokeWidth || 0 : 0;
  const hw = ((obj.width || 0) + sw) / 2;
  const hh = ((obj.height || 0) + sw) / 2;
  const u = SIDE_UNIT[side];

  const p = util.transformPoint(new Point(u.x * hw, u.y * hh), m);
  const c = util.transformPoint(new Point(0, 0), m);
  const out = sub(p, c);

  return { point: { x: p.x, y: p.y }, dir: len(out) < 1e-6 ? u : norm(out) };
};

// ─── Connect targets ──────────────────────────────────────────────────────────
// A connector end can bind to a Fabric object or to an HTML overlay node.
// Both are exposed through the same small interface.

/** Scene-space rectangle of an HTML overlay node (top-left + size). */
export interface NodeRect {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Minimap colour from the node type, if it defines one. */
  color?: string;
}

export type ConnectTarget =
  | { kind: "object"; id: string; object: FabricObject; center: () => Pt; anchor: (side: AnchorSide) => ResolvedEnd }
  | { kind: "node";   id: string; rect: NodeRect;       center: () => Pt; anchor: (side: AnchorSide) => ResolvedEnd };

export const objectTarget = (object: FabricObject): ConnectTarget => ({
  kind: "object",
  id: (object as any).id,
  object,
  center: () => getObjectCenter(object),
  anchor: (side) => getAnchorPoint(object, side),
});

export const nodeTarget = (id: string, rect: NodeRect): ConnectTarget => ({
  kind: "node",
  id,
  rect,
  center: () => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }),
  anchor: (side) => {
    const u = SIDE_UNIT[side];
    return {
      point: { x: rect.x + rect.width * (0.5 + u.x / 2), y: rect.y + rect.height * (0.5 + u.y / 2) },
      dir: u,
    };
  },
});

export type TargetLookup = (id: string) => ConnectTarget | undefined;

/** The side of `target` whose anchor sits closest to `towards`. */
export const getClosestSide = (target: ConnectTarget, towards: Pt): AnchorSide => {
  let best: AnchorSide = "right";
  let bestDist = Infinity;
  for (const side of ANCHOR_SIDES) {
    const d = len(sub(target.anchor(side).point, towards));
    if (d < bestDist) {
      bestDist = d;
      best = side;
    }
  }
  return best;
};

// ─── Routing ──────────────────────────────────────────────────────────────────

const ELBOW_STUB = 24;
const CORNER_RADIUS = 10;
const CURVE_SAMPLES = 32;

const simplify = (pts: Pt[]): Pt[] => {
  const out: Pt[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - p.x) < 0.01 && Math.abs(last.y - p.y) < 0.01) continue;
    // Drop the middle point of three collinear points.
    if (out.length >= 2) {
      const a = out[out.length - 2];
      const cross = (last.x - a.x) * (p.y - a.y) - (last.y - a.y) * (p.x - a.x);
      if (Math.abs(cross) < 0.01) out.pop();
    }
    out.push(p);
  }
  return out;
};

/**
 * Orthogonal route between two ends. Each bound end leaves along its side's
 * normal for a short stub, then the stubs are joined with one or two bends.
 */
const elbowRoute = (s: ResolvedEnd, t: ResolvedEnd): Pt[] => {
  const p1 = s.point;
  const p2 = t.point;
  const d1 = axisSnap(s.dir ?? sub(p2, p1));
  const d2 = axisSnap(t.dir ?? sub(p1, p2));
  const a = add(p1, mul(d1, s.dir ? ELBOW_STUB : 0));
  const b = add(p2, mul(d2, t.dir ? ELBOW_STUB : 0));

  const h1 = d1.x !== 0;
  const h2 = d2.x !== 0;
  const mid: Pt[] = [];

  if (h1 && h2) {
    const sameDir = d1.x === d2.x;
    const facingAway = !sameDir && (d1.x > 0 ? a.x > b.x : a.x < b.x);
    if (sameDir) {
      const x = d1.x > 0 ? Math.max(a.x, b.x) : Math.min(a.x, b.x);
      mid.push({ x, y: a.y }, { x, y: b.y });
    } else if (facingAway) {
      const y = (a.y + b.y) / 2;
      mid.push({ x: a.x, y }, { x: b.x, y });
    } else {
      const x = (a.x + b.x) / 2;
      mid.push({ x, y: a.y }, { x, y: b.y });
    }
  } else if (!h1 && !h2) {
    const sameDir = d1.y === d2.y;
    const facingAway = !sameDir && (d1.y > 0 ? a.y > b.y : a.y < b.y);
    if (sameDir) {
      const y = d1.y > 0 ? Math.max(a.y, b.y) : Math.min(a.y, b.y);
      mid.push({ x: a.x, y }, { x: b.x, y });
    } else if (facingAway) {
      const x = (a.x + b.x) / 2;
      mid.push({ x, y: a.y }, { x, y: b.y });
    } else {
      const y = (a.y + b.y) / 2;
      mid.push({ x: a.x, y }, { x: b.x, y });
    }
  } else if (h1) {
    // Horizontal out of the source, vertical into the target: one bend if it
    // doesn't double back on either stub, otherwise a Z through the middle.
    const forward = Math.sign(b.x - a.x) !== -d1.x && Math.sign(a.y - b.y) !== -d2.y;
    if (forward) mid.push({ x: b.x, y: a.y });
    else {
      const x = (a.x + b.x) / 2;
      mid.push({ x, y: a.y }, { x, y: b.y });
    }
  } else {
    const forward = Math.sign(b.y - a.y) !== -d1.y && Math.sign(a.x - b.x) !== -d2.x;
    if (forward) mid.push({ x: a.x, y: b.y });
    else {
      const y = (a.y + b.y) / 2;
      mid.push({ x: a.x, y }, { x: b.x, y });
    }
  }

  return simplify([p1, a, ...mid, b, p2]);
};

const bezierAt = (r: Extract<Route, { kind: "bezier" }>, t: number): Pt => {
  const mt = 1 - t;
  const a = mt * mt * mt, b = 3 * mt * mt * t, c = 3 * mt * t * t, d = t * t * t;
  return {
    x: a * r.p1.x + b * r.c1.x + c * r.c2.x + d * r.p2.x,
    y: a * r.p1.y + b * r.c1.y + c * r.c2.y + d * r.p2.y,
  };
};

const distToSegment = (p: Pt, a: Pt, b: Pt) => {
  const ab = sub(b, a);
  const l2 = ab.x * ab.x + ab.y * ab.y;
  if (l2 === 0) return len(sub(p, a));
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / l2));
  return len(sub(p, add(a, mul(ab, t))));
};

// ─── Connector class ──────────────────────────────────────────────────────────

const CONNECTOR_PROPS = ["source", "target", "lineType", "startArrow", "endArrow"] as const;

export class Connector extends FabricObject {
  static type = "connector";

  declare source: ConnectorEnd;
  declare target: ConnectorEnd;
  declare lineType: ConnectorLineType;
  declare startArrow: boolean;
  declare endArrow: boolean;

  /** Scene-space samples along the route — used for hit testing and bounds. */
  private _samples: Pt[] = [];
  private _route: Route = { kind: "poly", pts: [] };
  /** Pointer is over the connector (set by useConnectors; not saved). */
  isHovered = false;

  constructor(options: Record<string, any> = {}) {
    super({
      ...options,
      originX: "center",
      originY: "center",
      angle: 0,
      scaleX: 1,
      scaleY: 1,
      skewX: 0,
      skewY: 0,
      fill: null,
      // The route is drawn in scene space, so a cached bitmap would be stale
      // the moment an attached shape moves.
      objectCaching: false,
      hasControls: false,
      hasBorders: false,
      lockMovementX: true,
      lockMovementY: true,
      lockScalingX: true,
      lockScalingY: true,
      lockRotation: true,
      strokeLineCap: "round",
      strokeLineJoin: "round",
    });
    this.source = options.source ?? { id: null, anchor: null, x: 0, y: 0 };
    this.target = options.target ?? { id: null, anchor: null, x: 0, y: 0 };
    this.lineType = options.lineType ?? "elbow";
    this.startArrow = options.startArrow ?? false;
    this.endArrow = options.endArrow ?? true;
    this.hoverCursor = "pointer";

    // Lay out from the stored end points; bound ends snap to their shapes on
    // the first refreshConnectors() pass.
    this.updateRoute(() => undefined);
  }

  // ── Routing ────────────────────────────────────────────────────────────────

  private resolveEnd(end: ConnectorEnd, target: ConnectTarget | undefined, other: Pt): ResolvedEnd {
    if (!target || !end.anchor) return { point: { x: end.x, y: end.y }, dir: null };
    const side = end.anchor === "auto" ? getClosestSide(target, other) : end.anchor;
    return target.anchor(side);
  }

  /**
   * Recompute the route from the current end bindings.
   * `lookup` resolves an id to a live object or overlay card. An id that
   * doesn't resolve (e.g. cards not loaded yet) keeps its last position.
   */
  updateRoute(lookup: TargetLookup) {
    const sObj = this.source.id ? lookup(this.source.id) : undefined;
    const tObj = this.target.id ? lookup(this.target.id) : undefined;
    const sRef = sObj ? sObj.center() : { x: this.source.x, y: this.source.y };
    const tRef = tObj ? tObj.center() : { x: this.target.x, y: this.target.y };

    const s = this.resolveEnd(this.source, sObj, tRef);
    const t = this.resolveEnd(this.target, tObj, sRef);
    this.source.x = s.point.x; this.source.y = s.point.y;
    this.target.x = t.point.x; this.target.y = t.point.y;

    if (this.lineType === "curved") {
      const dist = len(sub(t.point, s.point));
      const k = Math.max(30, Math.min(200, dist * 0.45));
      const d1 = s.dir ?? norm(sub(t.dir ? add(t.point, mul(t.dir, k)) : t.point, s.point));
      const c1 = add(s.point, mul(d1, k));
      const d2 = t.dir ?? norm(sub(c1, t.point));
      const route = { kind: "bezier" as const, p1: s.point, c1, c2: add(t.point, mul(d2, k)), p2: t.point };
      this._route = route;
      this._samples = Array.from({ length: CURVE_SAMPLES + 1 }, (_, i) => bezierAt(route, i / CURVE_SAMPLES));
    } else {
      const pts = this.lineType === "elbow" ? elbowRoute(s, t) : [s.point, t.point];
      this._route = { kind: "poly", pts };
      this._samples = pts;
    }

    this.layoutBounds();
  }

  /** Fit width/height/position around the route so selection and culling stay correct. */
  private layoutBounds() {
    const pad = this.arrowSize().length + (this.strokeWidth || 1);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of this._samples) {
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
    }
    if (!isFinite(minX)) { minX = maxX = this.source.x; minY = maxY = this.source.y; }

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    this.set({
      width: maxX - minX + pad * 2,
      height: maxY - minY + pad * 2,
      angle: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0,
    });
    this.setXY(new Point(cx, cy), "center", "center");
    this.setCoords();
    this.dirty = true;
  }

  private arrowSize() {
    const sw = this.strokeWidth || 1;
    const length = 7 + sw * 2.5;
    // `join` strokes the head in its own colour so the corners come out
    // rounded, matching the soft-cornered design language.
    return { length, width: length * 0.8, join: Math.max(1, sw * 0.75) };
  }

  /** Direction the line travels as it arrives at each end. */
  private endTangents(): { start: Pt; end: Pt } {
    const r = this._route;
    if (r.kind === "bezier") {
      const start = len(sub(r.p1, r.c1)) > 1e-6 ? sub(r.p1, r.c1) : sub(r.p1, r.p2);
      const end = len(sub(r.p2, r.c2)) > 1e-6 ? sub(r.p2, r.c2) : sub(r.p2, r.p1);
      return { start: norm(start), end: norm(end) };
    }
    const n = r.pts.length;
    if (n < 2) return { start: { x: -1, y: 0 }, end: { x: 1, y: 0 } };
    return { start: norm(sub(r.pts[0], r.pts[1])), end: norm(sub(r.pts[n - 1], r.pts[n - 2])) };
  }

  // ── Rendering ──────────────────────────────────────────────────────────────

  private tracePath(ctx: CanvasRenderingContext2D, trimStart: number, trimEnd: number) {
    const r = this._route;
    const tan = this.endTangents();
    ctx.beginPath();

    if (r.kind === "bezier") {
      const p1 = sub(r.p1, mul(tan.start, trimStart));
      const p2 = sub(r.p2, mul(tan.end, trimEnd));
      ctx.moveTo(p1.x, p1.y);
      ctx.bezierCurveTo(r.c1.x, r.c1.y, r.c2.x, r.c2.y, p2.x, p2.y);
      return;
    }

    const pts = r.pts.slice();
    if (pts.length < 2) return;
    pts[0] = sub(pts[0], mul(tan.start, trimStart));
    pts[pts.length - 1] = sub(pts[pts.length - 1], mul(tan.end, trimEnd));

    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
      const prev = pts[i - 1], cur = pts[i], next = pts[i + 1];
      const radius = Math.min(CORNER_RADIUS, len(sub(cur, prev)) / 2, len(sub(next, cur)) / 2);
      ctx.arcTo(cur.x, cur.y, next.x, next.y, radius);
    }
    ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
  }

  private drawArrowHead(ctx: CanvasRenderingContext2D, tip: Pt, dir: Pt) {
    const { length, width, join } = this.arrowSize();
    // Pull the geometric tip back by half the rounding stroke so the visible
    // tip lands exactly on the target's edge.
    const t = sub(tip, mul(dir, join / 2));
    const base = sub(t, mul(dir, length - join));
    const perp = { x: -dir.y, y: dir.x };
    const half = (width - join) / 2;
    ctx.beginPath();
    ctx.moveTo(t.x, t.y);
    ctx.lineTo(base.x + perp.x * half, base.y + perp.y * half);
    ctx.lineTo(base.x - perp.x * half, base.y - perp.y * half);
    ctx.closePath();
    ctx.lineJoin = "round";
    ctx.lineWidth = join;
    ctx.fill();
    ctx.stroke();
  }

  _render(ctx: CanvasRenderingContext2D) {
    // When the canvas has a connector layer (see useConnectors), the live view
    // is painted there, above the HTML cards. Other contexts — exports,
    // thumbnails — still get the connector drawn here.
    const canvas = this.canvas as Canvas | undefined;
    if (canvas && hasConnectorLayer(canvas) && ctx === (canvas as any).contextContainer) return;

    ctx.save();
    // Undo the object (and any parent group) transform so the route can be
    // drawn directly in scene coordinates.
    const inv = util.invertTransform(this.calcTransformMatrix());
    ctx.transform(inv[0], inv[1], inv[2], inv[3], inv[4], inv[5]);
    this.renderRoute(ctx);
    ctx.restore();
  }

  /** Paint the route onto a context already transformed to scene coordinates. */
  renderRoute(ctx: CanvasRenderingContext2D) {
    if (this._samples.length < 2 || !this.visible) return;

    const stroke = (this.stroke as string) || CONNECTOR_DEFAULT_COLOR;
    const sw = this.strokeWidth || 1;
    const { length } = this.arrowSize();
    const trimStart = this.startArrow ? length * 0.6 : 0;
    const trimEnd = this.endArrow ? length * 0.6 : 0;

    ctx.save();
    ctx.globalAlpha *= this.opacity ?? 1;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Selected: brand-blue glow. Hovered: a lighter one, so it's clear what a click will pick.
    const selected = (this.canvas as Canvas | undefined)?.getActiveObject?.() === this;
    if (selected || this.isHovered) {
      ctx.strokeStyle = blueAlpha(selected ? 0.32 : 0.18);
      ctx.lineWidth = sw + (selected ? 8 : 6);
      ctx.setLineDash([]);
      this.tracePath(ctx, 0, 0);
      ctx.stroke();
    }

    ctx.strokeStyle = stroke;
    ctx.lineWidth = sw;
    ctx.setLineDash(this.strokeDashArray ?? []);
    this.tracePath(ctx, trimStart, trimEnd);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.fillStyle = stroke;
    ctx.strokeStyle = stroke;
    const tan = this.endTangents();
    if (this.startArrow) this.drawArrowHead(ctx, this.source, tan.start);
    if (this.endArrow) this.drawArrowHead(ctx, this.target, tan.end);

    ctx.restore();
  }

  /** Scene-space points along the current route (read-only; e.g. for a minimap). */
  getRoutePoints(): readonly Pt[] {
    return this._samples;
  }

  // ── Hit testing ────────────────────────────────────────────────────────────
  // The default tests use the bounding box, which for a diagonal or elbow
  // route covers lots of empty canvas. These test the actual route instead.

  /** Whether `point` (scene) lies within `tolerance` scene units of the route. */
  isNearRoute(point: Pt, tolerance: number) {
    const reach = tolerance + (this.strokeWidth || 1) / 2;
    for (let i = 1; i < this._samples.length; i++) {
      if (distToSegment(point, this._samples[i - 1], this._samples[i]) <= reach) return true;
    }
    return false;
  }

  containsPoint(point: Point) {
    const zoom = this.canvas?.getZoom() ?? 1;
    return this.isNearRoute(point, 6 / zoom);
  }

  private intersectsPolygon(polygon: Point[]) {
    if (this._samples.some((p) => Intersection.isPointInPolygon(new Point(p.x, p.y), polygon))) return true;
    for (let i = 1; i < this._samples.length; i++) {
      const a = new Point(this._samples[i - 1].x, this._samples[i - 1].y);
      const b = new Point(this._samples[i].x, this._samples[i].y);
      if (Intersection.intersectSegmentPolygon(a, b, polygon).status === "Intersection") return true;
    }
    return false;
  }

  // Connectors stay out of rubber-band selections: they follow the shapes they
  // connect, so a multi-selection never has to move them itself.
  intersectsWithRect(_tl: Point, _br: Point) {
    return false;
  }

  isContainedWithinRect(_tl: Point, _br: Point) {
    return false;
  }

  intersectsWithObject(other: FabricObject) {
    return this.intersectsPolygon(other.getCoords());
  }

  // ── Serialization ──────────────────────────────────────────────────────────

  toObject(propertiesToInclude: any[] = []): any {
    const obj: any = super.toObject([...propertiesToInclude, ...CONNECTOR_PROPS] as any);
    // Copy the ends so later mutation doesn't leak into history snapshots.
    obj.source = { ...this.source };
    obj.target = { ...this.target };
    return obj;
  }

  static fromObject(object: any): Promise<Connector> {
    const { type: _type, ...options } = object;
    return Promise.resolve(new Connector(options));
  }
}

classRegistry.setClass(Connector, "connector");

// ─── Canvas helpers ───────────────────────────────────────────────────────────

let idCounter = 0;
export const createObjectId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `obj-${Date.now().toString(36)}-${(idCounter++).toString(36)}`;

// Persist `id` on every object so connectors can find their endpoints again
// after a reload or undo/redo.
if (!FabricObject.customProperties.includes("id")) {
  FabricObject.customProperties = [...FabricObject.customProperties, "id"];
}

export const isConnector = (obj: unknown): obj is Connector => obj instanceof Connector;

// Canvases whose connectors are painted on a separate layer above the cards.
const layered = new WeakSet<Canvas>();
export const setConnectorLayer = (canvas: Canvas, enabled: boolean) => {
  if (enabled) layered.add(canvas);
  else layered.delete(canvas);
};
export const hasConnectorLayer = (canvas: Canvas) => layered.has(canvas);

/** Objects a connector can attach to: anything except lines, arrows, connectors and transient helpers. */
export const isConnectable = (obj: FabricObject) =>
  !(obj instanceof Connector) &&
  !["line", "arrow", "bidirectional-arrow", "activeselection", "activeSelection"].includes(obj.type) &&
  !obj.excludeFromExport &&
  obj.visible !== false;

export const getConnectors = (canvas: Canvas) => canvas.getObjects().filter(isConnector);

// Scene rects of the HTML overlay cards, published by the overlay layer so
// connectors (which live on the Fabric canvas) can attach to them.
const nodeRegistry = new WeakMap<Canvas, Map<string, NodeRect>>();

export const setNodeRects = (canvas: Canvas, rects: Map<string, NodeRect>) => {
  nodeRegistry.set(canvas, rects);
};

export const getNodeRects = (canvas: Canvas): Map<string, NodeRect> =>
  nodeRegistry.get(canvas) ?? new Map();

/** Resolve ids to Fabric objects or overlay cards, snapshotting the canvas once. */
export const createTargetLookup = (canvas: Canvas): TargetLookup => {
  const objects = new Map<string, FabricObject>();
  for (const obj of canvas.getObjects()) {
    const id = (obj as any).id;
    if (id) objects.set(id, obj);
  }
  const nodes = getNodeRects(canvas);
  return (id) => {
    const obj = objects.get(id);
    if (obj) return objectTarget(obj);
    const rect = nodes.get(id);
    return rect ? nodeTarget(id, rect) : undefined;
  };
};

/** Re-route every connector on the canvas against the current object and card positions. */
export const refreshConnectors = (canvas: Canvas) => {
  const connectors = getConnectors(canvas);
  if (!connectors.length) return;
  const lookup = createTargetLookup(canvas);
  for (const c of connectors) c.updateRoute(lookup);
};

/**
 * Give pasted/cloned objects fresh ids, rewiring connectors among them to the
 * new ids. A connector end whose object isn't part of the batch becomes free.
 */
export const reassignIds = (objects: FabricObject[]) => {
  const remap = new Map<string, string>();
  for (const obj of objects) {
    if (isConnector(obj)) continue;
    const oldId = (obj as any).id;
    const newId = createObjectId();
    if (oldId) remap.set(oldId, newId);
    (obj as any).id = newId;
  }
  for (const obj of objects) {
    if (!isConnector(obj)) continue;
    (obj as any).id = createObjectId();
    for (const key of ["source", "target"] as const) {
      const end = { ...obj[key] };
      if (end.id) {
        const mapped = remap.get(end.id);
        end.id = mapped ?? null;
        if (!mapped) end.anchor = null;
      }
      obj[key] = end;
    }
  }
};

/** Remove every connector attached to any of `ids`. Returns how many were removed. */
export const removeConnectorsFor = (canvas: Canvas, ids: Set<string>) => {
  const doomed = getConnectors(canvas).filter(
    (c) => (c.source.id && ids.has(c.source.id)) || (c.target.id && ids.has(c.target.id))
  );
  doomed.forEach((c) => canvas.remove(c));
  return doomed.length;
};
