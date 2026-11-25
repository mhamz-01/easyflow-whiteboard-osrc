"use client";

// Minimap — a scaled overview of every shape, connector and card with the visible viewport; click or drag to navigate, Ctrl+wheel to zoom, one button to fit everything.

import React, { RefObject, useCallback, useEffect, useRef, useState } from "react";
import type { Canvas, FabricObject } from "fabric";
import { Map as MapIcon, Maximize2, Minus } from "lucide-react";
import { getNodeRects, isConnector } from "../../lib/fabric-connector";
import { cn } from "../../lib/utils";
import { EF, blueAlpha } from "../../lib/design-tokens";

interface MinimapProps {
  fabricCanvas: RefObject<Canvas | null>;
  canvasReady: boolean;
}

type Bounds = { minX: number; minY: number; maxX: number; maxY: number };
/** Scene → minimap mapping: m = (scene - min) * scale + offset. */
type Layout = { scale: number; ox: number; oy: number; minX: number; minY: number };

const MAP_W = 220;
const MAP_H = 140;
const INSET = 8;            // px of breathing room inside the map
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;
const FIT_MAX_ZOOM = 1;     // fitting a small board shouldn't blow it up past 100%
const FIT_PADDING = 80;     // screen px around content when fitting

const NODE_DEFAULT_COLOR = "#029AFF";

// ── Scene geometry ──────────────────────────────────────────────────────────

const union = (a: Bounds | null, b: Bounds): Bounds =>
  a ? { minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY), maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY) } : b;

/** Objects worth drawing: skips helpers like the eraser trail and selection trackers. */
const drawable = (canvas: Canvas) => canvas.getObjects().filter((o) => o.visible && !o.excludeFromExport);

const contentBounds = (canvas: Canvas): Bounds | null => {
  let b: Bounds | null = null;
  for (const obj of drawable(canvas)) {
    const r = obj.getBoundingRect();
    b = union(b, { minX: r.left, minY: r.top, maxX: r.left + r.width, maxY: r.top + r.height });
  }
  getNodeRects(canvas).forEach((r) => {
    b = union(b, { minX: r.x, minY: r.y, maxX: r.x + r.width, maxY: r.y + r.height });
  });
  return b;
};

/** The part of the scene currently on screen. */
const viewportBounds = (canvas: Canvas): Bounds => {
  const v = canvas.viewportTransform;
  const z = v[0] || 1;
  return {
    minX: -v[4] / z,
    minY: -v[5] / z,
    maxX: (canvas.getWidth() - v[4]) / z,
    maxY: (canvas.getHeight() - v[5]) / z,
  };
};

const computeLayout = (b: Bounds): Layout => {
  const w = Math.max(b.maxX - b.minX, 1);
  const h = Math.max(b.maxY - b.minY, 1);
  const scale = Math.min((MAP_W - INSET * 2) / w, (MAP_H - INSET * 2) / h);
  return {
    scale,
    minX: b.minX,
    minY: b.minY,
    ox: (MAP_W - w * scale) / 2,
    oy: (MAP_H - h * scale) / 2,
  };
};

const objectColor = (obj: FabricObject): string => {
  if (obj.type === "frame") return "rgba(229, 231, 235, 0.35)";
  if (obj.type === "image") return "#6b7280";
  if (obj.type === "i-text" || obj.type === "textbox" || obj.type === "text") return "#a3a3a3";
  const fill = typeof obj.fill === "string" && obj.fill !== "transparent" && obj.fill !== "" ? obj.fill : null;
  const stroke = typeof obj.stroke === "string" ? obj.stroke : null;
  return fill ?? stroke ?? "#9ca3af";
};

// ── Component ───────────────────────────────────────────────────────────────

export default React.memo(function Minimap({ fabricCanvas, canvasReady }: MinimapProps) {
  const mapRef = useRef<HTMLCanvasElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [cursor, setCursor] = useState<"pointer" | "grab" | "grabbing">("pointer");

  const layoutRef = useRef<Layout | null>(null);
  // While dragging, the mapping is frozen — otherwise moving the viewport
  // grows the bounds and the map rescales under the pointer.
  const dragRef = useRef<{ pointerId: number; layout: Layout; offset: { x: number; y: number } } | null>(null);
  const rafRef = useRef<number | null>(null);

  // ── Drawing ──────────────────────────────────────────────────────────────

  const draw = useCallback(() => {
    rafRef.current = null;
    const canvas = fabricCanvas.current;
    const el = mapRef.current;
    if (!canvas || !el) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    if (el.width !== MAP_W * dpr) { el.width = MAP_W * dpr; el.height = MAP_H * dpr; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, MAP_W, MAP_H);

    const view = viewportBounds(canvas);
    const layout = dragRef.current?.layout ?? computeLayout(union(contentBounds(canvas), view));
    layoutRef.current = layout;

    const mx = (x: number) => (x - layout.minX) * layout.scale + layout.ox;
    const my = (y: number) => (y - layout.minY) * layout.scale + layout.oy;

    // Shapes, text, images, paths — as their bounding boxes.
    for (const obj of drawable(canvas)) {
      if (isConnector(obj)) continue;
      const r = obj.getBoundingRect();
      const x = mx(r.left), y = my(r.top);
      const w = Math.max(r.width * layout.scale, 1.5), h = Math.max(r.height * layout.scale, 1.5);
      const color = objectColor(obj);
      const outlined = obj.fill === "transparent" || !obj.fill;
      ctx.globalAlpha = 0.85;
      if (outlined && obj.type !== "frame") {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, Math.max(w - 1, 0.5), Math.max(h - 1, 0.5));
      } else {
        ctx.fillStyle = color;
        ctx.fillRect(x, y, w, h);
      }
    }

    // Connectors — their actual routes.
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 1;
    ctx.lineJoin = "round";
    for (const obj of drawable(canvas)) {
      if (!isConnector(obj)) continue;
      const pts = obj.getRoutePoints();
      if (pts.length < 2) continue;
      ctx.strokeStyle = typeof obj.stroke === "string" ? obj.stroke : EF.muted;
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(mx(p.x), my(p.y)) : ctx.moveTo(mx(p.x), my(p.y))));
      ctx.stroke();
    }

    // HTML nodes, in their type's minimap colour.
    ctx.globalAlpha = 0.9;
    getNodeRects(canvas).forEach((r) => {
      ctx.fillStyle = r.color ?? NODE_DEFAULT_COLOR;
      ctx.fillRect(mx(r.x), my(r.y), Math.max(r.width * layout.scale, 2), Math.max(r.height * layout.scale, 2));
    });

    // Visible area.
    ctx.globalAlpha = 1;
    const vx = mx(view.minX), vy = my(view.minY);
    const vw = (view.maxX - view.minX) * layout.scale, vh = (view.maxY - view.minY) * layout.scale;
    ctx.fillStyle = blueAlpha(0.12);
    ctx.fillRect(vx, vy, vw, vh);
    ctx.strokeStyle = EF.blue;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(vx + 0.75, vy + 0.75, Math.max(vw - 1.5, 1), Math.max(vh - 1.5, 1));
  }, [fabricCanvas]);

  const scheduleDraw = useCallback(() => {
    if (rafRef.current === null) rafRef.current = requestAnimationFrame(draw);
  }, [draw]);

  // Redraw after every main-canvas render (pan, zoom, edits, card moves all
  // end in one), coalesced to one draw per frame.
  useEffect(() => {
    const canvas = fabricCanvas.current;
    if (!canvas || !canvasReady || collapsed) return;
    const onRender = ({ ctx }: { ctx: CanvasRenderingContext2D }) => {
      if (ctx === (canvas as any).contextContainer) scheduleDraw();
    };
    canvas.on("after:render", onRender as any);
    window.addEventListener("resize", scheduleDraw);
    scheduleDraw();
    return () => {
      canvas.off("after:render", onRender as any);
      window.removeEventListener("resize", scheduleDraw);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [fabricCanvas, canvasReady, collapsed, scheduleDraw]);

  // ── Navigation ───────────────────────────────────────────────────────────

  const toScene = (layout: Layout, e: { clientX: number; clientY: number }) => {
    const r = mapRef.current!.getBoundingClientRect();
    return {
      x: (e.clientX - r.left - layout.ox) / layout.scale + layout.minX,
      y: (e.clientY - r.top - layout.oy) / layout.scale + layout.minY,
    };
  };

  const centerOn = (x: number, y: number) => {
    const canvas = fabricCanvas.current;
    if (!canvas) return;
    const z = canvas.getZoom();
    canvas.setViewportTransform([z, 0, 0, z, canvas.getWidth() / 2 - x * z, canvas.getHeight() / 2 - y * z]);
    canvas.requestRenderAll();
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = fabricCanvas.current;
    const layout = layoutRef.current;
    if (!canvas || !layout || e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);

    const p = toScene(layout, e);
    const v = viewportBounds(canvas);
    const inside = p.x >= v.minX && p.x <= v.maxX && p.y >= v.minY && p.y <= v.maxY;
    const center = { x: (v.minX + v.maxX) / 2, y: (v.minY + v.maxY) / 2 };
    // Grabbing the viewport box keeps the grab point under the pointer;
    // clicking elsewhere jumps there.
    const offset = inside ? { x: p.x - center.x, y: p.y - center.y } : { x: 0, y: 0 };
    dragRef.current = { pointerId: e.pointerId, layout, offset };
    setCursor("grabbing");
    if (!inside) centerOn(p.x, p.y);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    const canvas = fabricCanvas.current;
    if (drag && drag.pointerId === e.pointerId) {
      const p = toScene(drag.layout, e);
      centerOn(p.x - drag.offset.x, p.y - drag.offset.y);
      return;
    }
    const layout = layoutRef.current;
    if (!canvas || !layout) return;
    const p = toScene(layout, e);
    const v = viewportBounds(canvas);
    setCursor(p.x >= v.minX && p.x <= v.maxX && p.y >= v.minY && p.y <= v.maxY ? "grab" : "pointer");
  };

  const endDrag = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current?.pointerId !== e.pointerId) return;
    dragRef.current = null;
    setCursor("grab");
    scheduleDraw(); // re-fit the map now that the drag is over
  };

  // Ctrl/⌘+wheel zooms around the middle of the screen; a plain wheel is
  // swallowed so the page doesn't scroll behind the map.
  useEffect(() => {
    const el = mapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const canvas = fabricCanvas.current;
      if (!canvas || !(e.ctrlKey || e.metaKey)) return;
      const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, canvas.getZoom() * Math.pow(0.999, e.deltaY)));
      canvas.zoomToPoint({ x: canvas.getWidth() / 2, y: canvas.getHeight() / 2 } as any, z);
      canvas.requestRenderAll();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [fabricCanvas, collapsed]);

  const fitToContent = useCallback(() => {
    const canvas = fabricCanvas.current;
    if (!canvas) return;
    const b = contentBounds(canvas);
    if (!b) return;
    const cw = canvas.getWidth(), ch = canvas.getHeight();
    const z = Math.min(
      FIT_MAX_ZOOM,
      Math.max(MIN_ZOOM, Math.min((cw - FIT_PADDING * 2) / Math.max(b.maxX - b.minX, 1), (ch - FIT_PADDING * 2) / Math.max(b.maxY - b.minY, 1)))
    );
    const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
    canvas.setViewportTransform([z, 0, 0, z, cw / 2 - cx * z, ch / 2 - cy * z]);
    canvas.requestRenderAll();
  }, [fabricCanvas]);

  // ── Render ───────────────────────────────────────────────────────────────

  const shell = "bg-[var(--wb-surface)]/95 backdrop-blur-md border border-white/10 shadow-lg shadow-black/20";
  const iconButton = "w-6 h-6 flex items-center justify-center rounded-md text-white/60 hover:text-white hover:bg-white/10 transition-colors";

  // Sits above the toolbar where the two could overlap, and next to it on wide screens.
  const position = "hidden md:block absolute right-4 bottom-24 xl:bottom-6 z-50";

  if (collapsed) {
    return (
      <div className={position}>
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className={cn(shell, "w-9 h-9 rounded-xl flex items-center justify-center text-white/70 hover:text-white transition-colors")}
          aria-label="Show minimap"
          title="Show minimap"
        >
          <MapIcon className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className={position}>
      <div className={cn(shell, "rounded-2xl p-1.5")}>
        <div className="flex items-center justify-between px-1 pb-1">
          <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-neutral-500">Map</span>
          <div className="flex items-center gap-0.5">
            <button type="button" onClick={fitToContent} className={iconButton} aria-label="Fit everything in view" title="Fit everything in view">
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={() => setCollapsed(true)} className={iconButton} aria-label="Hide minimap" title="Hide minimap">
              <Minus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <canvas
          ref={mapRef}
          role="img"
          aria-label="Whiteboard minimap"
          className="block rounded-xl bg-white/[0.03]"
          style={{ width: MAP_W, height: MAP_H, cursor, touchAction: "none" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        />
      </div>
    </div>
  );
});
