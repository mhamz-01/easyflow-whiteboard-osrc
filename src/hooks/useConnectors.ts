// Connector interactions — hover anchors on shapes and custom HTML nodes, drag from an anchor to connect, re-attach endpoints, and keep connectors glued to what they connect.

import { useEffect, useRef, RefObject } from "react";
import { ActiveSelection, Canvas, FabricObject, Point, util } from "fabric";
import {
  ANCHOR_SIDES,
  AnchorSide,
  ConnectTarget,
  Connector,
  ConnectorAnchor,
  ConnectorEnd,
  createObjectId,
  createTargetLookup,
  getAnchorPoint,
  getConnectors,
  getNodeRects,
  isConnectable,
  isConnector,
  nodeTarget,
  objectTarget,
  refreshConnectors,
  removeConnectorsFor,
  setConnectorLayer,
} from "../lib/fabric-connector";
import { calculateDashArray } from "../lib/fabric-utils";
import { EF, SURFACE, blueAlpha } from "../lib/design-tokens";
import { useWhiteboardStore } from "../store/whiteboard-store";

interface UseConnectorsProps {
  fabricCanvas:       RefObject<Canvas | null>;
  activeTool:         string;
  suppressHistoryRef: RefObject<boolean>;
  isRestoringRef:     RefObject<boolean>;
  pushHistory:        (state: string) => void;
}

type Pt = { x: number; y: number };

interface Gesture {
  kind:      "create" | "reattach";
  connector: Connector;
  /** The end that follows the pointer. */
  end:       "source" | "target";
  /** Id bound to the other end — never a valid drop target. */
  fixedId:   string | null;
  /** Anchor clicked to start a "create" gesture; enables click-to-duplicate. */
  fromSide:  AnchorSide | null;
  pointerId: number;
  startClient: Pt;
  moved:     boolean;
  /** End binding before a re-attach, restored on Escape. */
  previous:  ConnectorEnd;
  drop:      { id: string; pinned: AnchorSide | null } | null;
}

// All sizes are screen pixels — divided by zoom when converted to scene units.
const ANCHOR_OFFSET   = 18;  // how far outside the edge the hover dots sit
const ANCHOR_RADIUS   = 5;
const HIT_MOUSE       = 10;
const HIT_TOUCH       = 18;
const DROP_MARGIN     = 16;  // how close to a target counts as "over" it while dragging
const DRAG_THRESHOLD  = 4;
const DUPLICATE_GAP   = 80;
const CARD_RADIUS     = 16;  // matches the cards' rounded-2xl


const OPPOSITE: Record<AnchorSide, AnchorSide> = { top: "bottom", bottom: "top", left: "right", right: "left" };

// Shapes where a click on an anchor dot (no drag) creates a connected copy.
const DUPLICABLE_TYPES = new Set(["rect", "circle", "ellipse", "triangle", "polygon", "frame"]);

const NODE_SELECTOR = "[data-whiteboard-node]";

/** Above the card overlay (z 50), below the toolbar and panels (z 100). */
const LAYER_Z_INDEX = 60;

const ensureId = (obj: FabricObject): string => {
  const o = obj as any;
  if (!o.id) o.id = createObjectId();
  return o.id;
};

export const useConnectors = ({
  fabricCanvas,
  activeTool,
  suppressHistoryRef,
  isRestoringRef,
  pushHistory,
}: UseConnectorsProps) => {
  const activeToolRef  = useRef(activeTool);
  const pushHistoryRef = useRef(pushHistory);
  activeToolRef.current  = activeTool;
  pushHistoryRef.current = pushHistory;

  useEffect(() => {
    const canvas = fabricCanvas.current;
    if (!canvas) return;

    const wrapper = canvas.upperCanvasEl.parentElement;
    const board = wrapper?.parentElement;
    if (!wrapper || !board) return;

    // ── Connector layer ───────────────────────────────────────────────────────
    // Connectors, anchor dots and drop highlights are painted on their own
    // canvas stacked above the HTML cards; otherwise any line running past a
    // card would disappear under it. Input still goes through Fabric — this
    // layer never takes pointer events.
    const layer = document.createElement("canvas");
    layer.setAttribute("aria-hidden", "true");
    Object.assign(layer.style, { position: "absolute", pointerEvents: "none", zIndex: String(LAYER_Z_INDEX) });
    board.appendChild(layer);
    const layerCtx = layer.getContext("2d")!;
    setConnectorLayer(canvas, true);

    let hover: { id: string; side: AnchorSide | null } | null = null;
    let gesture: Gesture | null = null;
    // Set while we own a pointer gesture so Fabric and the cards never see its mouse/touch events.
    let swallowing = false;

    // ── Geometry helpers ──────────────────────────────────────────────────────

    const zoom = () => canvas.getZoom();
    const toScreen = (p: Pt) => util.transformPoint(new Point(p.x, p.y), canvas.viewportTransform);
    const screenDist = (a: Pt, b: Pt) => {
      const sa = toScreen(a), sb = toScreen(b);
      return Math.hypot(sa.x - sb.x, sa.y - sb.y);
    };

    /** Anchor position pushed `offset` screen px outward from the edge. */
    const anchorAt = (t: ConnectTarget, side: AnchorSide, offset: number): Pt => {
      const a = t.anchor(side);
      const d = offset / zoom();
      return { x: a.point.x + a.dir!.x * d, y: a.point.y + a.dir!.y * d };
    };

    const nearestAnchor = (t: ConnectTarget, p: Pt, radius: number, offset: number): AnchorSide | null => {
      let best: AnchorSide | null = null;
      let bestDist = radius;
      for (const side of ANCHOR_SIDES) {
        const d = screenDist(anchorAt(t, side, offset), p);
        if (d <= bestDist) { bestDist = d; best = side; }
      }
      return best;
    };

    /** Is `p` inside the target, grown by `margin` screen px? Handles rotated/scaled objects. */
    const isOver = (t: ConnectTarget, p: Pt, margin: number) => {
      const m = margin / zoom();
      if (t.kind === "node") {
        const r = t.rect;
        return p.x >= r.x - m && p.x <= r.x + r.width + m && p.y >= r.y - m && p.y <= r.y + r.height + m;
      }
      const obj = t.object;
      const local = util.transformPoint(new Point(p.x, p.y), util.invertTransform(obj.calcTransformMatrix()));
      const scale = obj.getObjectScaling();
      const sw = obj.stroke && !obj.strokeUniform ? obj.strokeWidth || 0 : 0;
      return (
        Math.abs(local.x) <= ((obj.width || 0) + sw) / 2 + m / Math.abs(scale.x || 1) &&
        Math.abs(local.y) <= ((obj.height || 0) + sw) / 2 + m / Math.abs(scale.y || 1)
      );
    };

    /** Everything connectable, topmost first — cards render above the canvas. */
    const allTargets = (): ConnectTarget[] => {
      const nodes = Array.from(getNodeRects(canvas), ([id, rect]) => nodeTarget(id, rect)).reverse();
      const objects = canvas.getObjects().filter(isConnectable).reverse().map((o) => { ensureId(o); return objectTarget(o); });
      return [...nodes, ...objects];
    };

    /** Topmost target under `p`; exact hits win over near-misses. */
    const targetAt = (p: Pt, margin: number, excludeId?: string | null): ConnectTarget | null => {
      const targets = allTargets().filter((t) => t.id !== excludeId);
      return targets.find((t) => isOver(t, p, 0)) ?? (margin ? targets.find((t) => isOver(t, p, margin)) : undefined) ?? null;
    };

    const resolve = (id: string | null | undefined) => (id ? createTargetLookup(canvas)(id) ?? null : null);

    const selectedTarget = (): ConnectTarget | null => {
      const active = canvas.getActiveObject();
      return active && !(active instanceof ActiveSelection) && isConnectable(active) ? objectTarget(active) : null;
    };

    const isEditingText = () => !!(canvas.getActiveObject() as any)?.isEditing;

    const canInteract = () =>
      useWhiteboardStore.getState().editable &&
      (activeToolRef.current === "select" || activeToolRef.current === "connector") &&
      !(canvas as any)._currentTransform &&
      !isEditingText();

    /** Events on the canvas or on one of this board's cards — not the toolbar or panels. */
    const isOnBoard = (el: EventTarget | null) =>
      el instanceof Element && (wrapper.contains(el) || (!!el.closest(NODE_SELECTOR) && board.contains(el)));

    const setHover = (next: { id: string; side: AnchorSide | null } | null) => {
      if (next?.id === hover?.id && next?.side === hover?.side) return;
      hover = next;
      canvas.requestRenderAll();
    };

    // ── Hover: which target shows its anchor dots ─────────────────────────────
    // A window listener, because over a card the pointer events go to the card,
    // not the canvas.

    // The connector under the pointer gets a light glow, so it's clear what a
    // click will select. Only on the canvas itself: over a card, a click goes
    // to the card.
    let hoveredConnector: Connector | null = null;
    const setHoveredConnector = (c: Connector | null) => {
      if (c === hoveredConnector) return;
      if (hoveredConnector) hoveredConnector.isHovered = false;
      hoveredConnector = c;
      if (c) c.isHovered = true;
      canvas.requestRenderAll();
    };

    const connectorAt = (e: PointerEvent): Connector | null => {
      if (e.buttons || hover?.side || !canInteract() || !wrapper.contains(e.target as Node)) return null;
      const p = canvas.getScenePoint(e);
      const connectors = getConnectors(canvas);
      for (let i = connectors.length - 1; i >= 0; i--) {
        if (connectors[i].evented !== false && connectors[i].containsPoint(p)) return connectors[i];
      }
      return null;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (gesture) return;
      updateAnchorHover(e);
      setHoveredConnector(connectorAt(e));
    };

    const updateAnchorHover = (e: PointerEvent) => {
      if (e.buttons || !canInteract() || !isOnBoard(e.target)) {
        setHover(null);
        return;
      }
      const p = canvas.getScenePoint(e);

      // Stay on the current target while the pointer is on one of its dots —
      // they sit outside it, so a fresh hit test would lose them.
      for (const t of [resolve(hover?.id), selectedTarget()]) {
        if (!t) continue;
        const side = nearestAnchor(t, p, HIT_MOUSE, ANCHOR_OFFSET);
        if (side) { setHover({ id: t.id, side }); return; }
      }

      const t = targetAt(p, ANCHOR_OFFSET + HIT_MOUSE);
      setHover(t ? { id: t.id, side: null } : null);
    };

    // Fabric sets its own cursor on every mousemove; this runs right after it.
    const onFabricMove = (opt: any) => {
      if (gesture || !canInteract()) return;
      const active = canvas.getActiveObject();
      if (isConnector(active) && [active.source, active.target].some((end) => screenDist(end, opt.scenePoint) <= HIT_MOUSE + 2)) {
        canvas.setCursor("grab");
      } else if (hover?.side) {
        canvas.setCursor("crosshair");
      }
    };

    // ── Gesture lifecycle ─────────────────────────────────────────────────────

    const newConnector = (source: ConnectorEnd, target: ConnectorEnd) => {
      const o = useWhiteboardStore.getState().toolOptions.connector;
      return new Connector({
        id:              createObjectId(),
        source,
        target,
        stroke:          o.strokeColor,
        strokeWidth:     o.strokeWidth,
        strokeDashArray: calculateDashArray(o.strokeDashArray, o.strokeWidth) ?? null,
        lineType:        o.lineType,
        startArrow:      o.startArrow,
        endArrow:        o.endArrow,
        selectable:      false,
        evented:         false,
      });
    };

    const beginGesture = (e: PointerEvent, g: Omit<Gesture, "pointerId" | "startClient" | "moved" | "drop">) => {
      e.preventDefault();
      e.stopPropagation();
      swallowing = true;
      suppressHistoryRef.current = true;
      gesture = { ...g, pointerId: e.pointerId, startClient: { x: e.clientX, y: e.clientY }, moved: false, drop: null };
      setHover(null);
      setHoveredConnector(null);
      window.addEventListener("pointermove", onDragMove);
      window.addEventListener("pointerup", onDragEnd);
      window.addEventListener("pointercancel", onDragCancel);
      window.addEventListener("keydown", onKeyDown);
    };

    const endListeners = () => {
      window.removeEventListener("pointermove", onDragMove);
      window.removeEventListener("pointerup", onDragEnd);
      window.removeEventListener("pointercancel", onDragCancel);
      window.removeEventListener("keydown", onKeyDown);
      // Let the trailing compat events of this gesture drain before handing input back.
      setTimeout(() => { swallowing = false; }, 0);
    };

    const commit = (select: FabricObject) => {
      suppressHistoryRef.current = false;
      pushHistoryRef.current(JSON.stringify(canvas.toJSON()));
      useWhiteboardStore.getState().setActiveTool("select");
      canvas.setActiveObject(select);
      canvas.requestRenderAll();
    };

    const onPointerDown = (e: PointerEvent) => {
      if (gesture || !e.isPrimary || e.button !== 0 || !isOnBoard(e.target) || !canInteract()) return;

      const p = canvas.getScenePoint(e);
      const hit = e.pointerType === "touch" ? HIT_TOUCH : HIT_MOUSE;
      const active = canvas.getActiveObject();
      const onCanvas = wrapper.contains(e.target as Node);

      // Fabric's resize/rotate handles win over anchor dots (they overlap on touch).
      if (onCanvas && active && !isConnector(active) && active.findControl(canvas.getViewportPoint(e), e.pointerType === "touch")) return;

      // 1. Grab an endpoint of the selected connector to re-attach it.
      if (isConnector(active)) {
        for (const end of ["target", "source"] as const) {
          if (screenDist(active[end], p) <= hit + 2) {
            beginGesture(e, {
              kind: "reattach",
              connector: active,
              end,
              fixedId: active[end === "source" ? "target" : "source"].id,
              fromSide: null,
              previous: { ...active[end] },
            });
            return;
          }
        }
      }

      // 2. Grab an anchor dot. On touch there's no hover, so also test the
      //    target under the finger.
      const candidates = [resolve(hover?.id), selectedTarget(), e.pointerType === "touch" ? targetAt(p, ANCHOR_OFFSET + hit) : null];
      for (const t of candidates) {
        if (!t) continue;
        const side = nearestAnchor(t, p, hit, ANCHOR_OFFSET);
        if (side) {
          startCreate(e, t, side, p);
          return;
        }
      }

      // 3. Connector tool: drag from anywhere — from a shape or card body the side is picked automatically.
      if (activeToolRef.current === "connector") {
        startCreate(e, targetAt(p, 0), null, p);
      }
    };

    const startCreate = (e: PointerEvent, from: ConnectTarget | null, side: AnchorSide | null, p: Pt) => {
      const source: ConnectorEnd = from
        ? { id: from.id, anchor: side ?? "auto", x: p.x, y: p.y }
        : { id: null, anchor: null, x: p.x, y: p.y };
      const connector = newConnector(source, { id: null, anchor: null, x: p.x, y: p.y });

      canvas.discardActiveObject();
      canvas.add(connector);
      connector.updateRoute(createTargetLookup(canvas));

      beginGesture(e, {
        kind: "create",
        connector,
        end: "target",
        fixedId: from?.id ?? null,
        fromSide: side,
        previous: { ...connector.target },
      });
    };

    const onDragMove = (e: PointerEvent) => {
      const g = gesture;
      if (!g || e.pointerId !== g.pointerId) return;

      if (!g.moved && Math.hypot(e.clientX - g.startClient.x, e.clientY - g.startClient.y) < DRAG_THRESHOLD) return;
      g.moved = true;

      const p = canvas.getScenePoint(e);
      const t = targetAt(p, DROP_MARGIN, g.fixedId);
      const pinned = t ? nearestAnchor(t, p, DROP_MARGIN, 0) : null;
      g.drop = t ? { id: t.id, pinned } : null;

      g.connector[g.end] = t
        ? { id: t.id, anchor: (pinned ?? "auto") as ConnectorAnchor, x: p.x, y: p.y }
        : { id: null, anchor: null, x: p.x, y: p.y };
      g.connector.updateRoute(createTargetLookup(canvas));
      canvas.requestRenderAll();
    };

    const onDragEnd = (e: PointerEvent) => {
      const g = gesture;
      if (!g || e.pointerId !== g.pointerId) return;
      gesture = null;
      endListeners();

      if (g.kind === "reattach") {
        if (!g.moved) { suppressHistoryRef.current = false; canvas.requestRenderAll(); return; }
        commit(g.connector);
        return;
      }

      if (!g.moved) {
        canvas.remove(g.connector);
        suppressHistoryRef.current = false;
        // A click (no drag) on an anchor dot grows the diagram: copy the shape
        // in that direction and connect to it.
        const from = resolve(g.fixedId);
        if (from?.kind === "object" && g.fromSide) void duplicateConnected(from.object, g.fromSide);
        else canvas.requestRenderAll();
        return;
      }

      g.connector.set({ selectable: true, evented: true });
      commit(g.connector);
    };

    const cancelGesture = () => {
      const g = gesture;
      if (!g) return;
      gesture = null;
      endListeners();
      if (g.kind === "create") canvas.remove(g.connector);
      else {
        g.connector[g.end] = g.previous;
        g.connector.updateRoute(createTargetLookup(canvas));
      }
      suppressHistoryRef.current = false;
      canvas.requestRenderAll();
    };

    const onDragCancel = (e: PointerEvent) => { if (gesture && e.pointerId === gesture.pointerId) cancelGesture(); };
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") cancelGesture(); };

    const duplicateConnected = async (shape: FabricObject, side: AnchorSide) => {
      if (shape.group || !DUPLICABLE_TYPES.has(shape.type)) { canvas.requestRenderAll(); return; }

      const clone = await shape.clone();
      (clone as any).id = createObjectId();
      const { width, height } = shape.getBoundingRect();
      const dx = side === "right" ? width + DUPLICATE_GAP : side === "left" ? -(width + DUPLICATE_GAP) : 0;
      const dy = side === "bottom" ? height + DUPLICATE_GAP : side === "top" ? -(height + DUPLICATE_GAP) : 0;
      clone.set({ left: shape.left + dx, top: shape.top + dy });
      clone.setCoords();

      suppressHistoryRef.current = true;
      canvas.add(clone);
      const p = getAnchorPoint(shape, side).point;
      const connector = newConnector(
        { id: ensureId(shape), anchor: side, x: p.x, y: p.y },
        { id: ensureId(clone), anchor: OPPOSITE[side], x: p.x, y: p.y },
      );
      connector.set({ selectable: true, evented: true });
      canvas.add(connector);
      connector.updateRoute(createTargetLookup(canvas));
      commit(clone);
    };

    // Keep Fabric (and card drag handlers) from reacting to a gesture we own.
    const swallow = (e: Event) => {
      if (!swallowing || !isOnBoard(e.target)) return;
      e.stopPropagation();
      if (e.cancelable) e.preventDefault();
    };

    // ── Overlay: anchor dots, drop highlight, connector endpoint handles ─────

    type DotStyle = "anchor" | "hot" | "drop" | "end-bound" | "end-free";

    /**
     * Handles follow the design system: dark surface with a Primary Blue ring
     * at rest, solid blue with a soft halo when active. Sizes are screen px.
     */
    const drawDot = (ctx: CanvasRenderingContext2D, p: Pt, style: DotStyle) => {
      const s = toScreen(p);
      const circle = (r: number) => { ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); };

      if (style === "hot") {
        circle(ANCHOR_RADIUS + 7);
        ctx.fillStyle = blueAlpha(0.22);
        ctx.fill();
      }

      const filled = style === "hot" || style === "end-bound";
      const r = style === "hot" ? ANCHOR_RADIUS + 2 : style === "drop" ? ANCHOR_RADIUS - 1 : style.startsWith("end") ? ANCHOR_RADIUS + 1 : ANCHOR_RADIUS;
      circle(r);
      ctx.fillStyle = filled ? EF.blue : SURFACE[useWhiteboardStore.getState().theme];
      ctx.fill();
      ctx.lineWidth = filled ? 1.5 : 2;
      ctx.strokeStyle = filled ? EF.foreground : EF.blue;
      ctx.stroke();
    };

    /** Drop-target highlight: blue outline with a soft glow, shaped like the target. */
    const drawOutline = (ctx: CanvasRenderingContext2D, t: ConnectTarget) => {
      ctx.save();
      ctx.beginPath();
      if (t.kind === "node") {
        const m = 3 / zoom();
        const { x, y, width, height } = t.rect;
        const tl = toScreen({ x: x - m, y: y - m });
        const br = toScreen({ x: x + width + m, y: y + height + m });
        ctx.roundRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y, CARD_RADIUS * zoom() + 3);
      } else if (t.object.type === "circle" || t.object.type === "ellipse") {
        const c = toScreen(t.object.getCenterPoint());
        const edge = toScreen(t.anchor("right").point);
        const top = toScreen(t.anchor("top").point);
        const angle = Math.atan2(edge.y - c.y, edge.x - c.x);
        ctx.ellipse(c.x, c.y, Math.hypot(edge.x - c.x, edge.y - c.y) + 2, Math.hypot(top.x - c.x, top.y - c.y) + 2, angle, 0, Math.PI * 2);
      } else {
        t.object.getCoords().map(toScreen).forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.closePath();
      }
      ctx.lineJoin = "round";
      ctx.shadowColor = blueAlpha(0.55);
      ctx.shadowBlur = 12;
      ctx.lineWidth = 2;
      ctx.strokeStyle = EF.blue;
      ctx.stroke();
      ctx.restore();
    };

    const syncLayerSize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.getWidth(), h = canvas.getHeight();
      if (layer.width !== Math.round(w * dpr) || layer.height !== Math.round(h * dpr)) {
        layer.width = Math.round(w * dpr);
        layer.height = Math.round(h * dpr);
        Object.assign(layer.style, { width: `${w}px`, height: `${h}px` });
      }
      layer.style.left = `${wrapper.offsetLeft}px`;
      layer.style.top = `${wrapper.offsetTop}px`;
      return dpr;
    };

    const drawOverlay = (ctx: CanvasRenderingContext2D) => {
      if (!useWhiteboardStore.getState().editable) return;

      if (gesture) {
        const drop = gesture.drop && resolve(gesture.drop.id);
        if (drop) {
          drawOutline(ctx, drop);
          for (const side of ANCHOR_SIDES) {
            drawDot(ctx, anchorAt(drop, side, 0), side === gesture.drop!.pinned ? "hot" : "drop");
          }
        }
        return;
      }
      if (!canInteract()) return;

      const targets = new Map<string, ConnectTarget>();
      for (const t of [selectedTarget(), resolve(hover?.id)]) if (t) targets.set(t.id, t);
      targets.forEach((t) => {
        for (const side of ANCHOR_SIDES) {
          const hot = t.id === hover?.id && side === hover?.side;
          drawDot(ctx, anchorAt(t, side, ANCHOR_OFFSET), hot ? "hot" : "anchor");
        }
      });

      const active = canvas.getActiveObject();
      if (isConnector(active)) {
        // Filled = attached, ring only = free end.
        drawDot(ctx, active.source, active.source.id ? "end-bound" : "end-free");
        drawDot(ctx, active.target, active.target.id ? "end-bound" : "end-free");
      }
    };

    // Repaint the layer whenever Fabric repaints the main canvas.
    const onAfterRender = ({ ctx }: { ctx: CanvasRenderingContext2D }) => {
      // after:render also fires for the top (selection) layer — only draw once.
      if (ctx !== (canvas as any).contextContainer) return;

      const dpr = syncLayerSize();
      layerCtx.setTransform(1, 0, 0, 1, 0, 0);
      layerCtx.clearRect(0, 0, layer.width, layer.height);

      const v = canvas.viewportTransform;
      layerCtx.setTransform(v[0] * dpr, v[1] * dpr, v[2] * dpr, v[3] * dpr, v[4] * dpr, v[5] * dpr);
      getConnectors(canvas).forEach((c) => c.renderRoute(layerCtx));

      // Dots and outlines are sized in screen pixels.
      layerCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawOverlay(layerCtx);
    };

    // ── Keep connectors attached ──────────────────────────────────────────────

    const follow = () => {
      if (getConnectors(canvas).length) refreshConnectors(canvas);
    };

    // Connectors follow their shapes, so a multi-selection never carries one.
    const dropConnectorsFromSelection = () => {
      const sel = canvas.getActiveObject();
      if (!(sel instanceof ActiveSelection)) return;
      const connectors = sel.getObjects().filter(isConnector);
      if (!connectors.length) return;
      sel.remove(...connectors);
      const rest = sel.getObjects();
      if (rest.length === 0) canvas.discardActiveObject();
      else if (rest.length === 1) canvas.setActiveObject(rest[0]);
      canvas.requestRenderAll();
    };

    // Undo/redo and hydration reload connectors from JSON, but cards aren't part
    // of canvas history — re-route once the batch is in so ends land on the
    // cards' current positions.
    let refreshRaf: number | null = null;
    const onAdded = ({ target }: { target: FabricObject }) => {
      if (isConnectable(target)) ensureId(target);
      if (isConnector(target) && !gesture && refreshRaf === null) {
        refreshRaf = requestAnimationFrame(() => {
          refreshRaf = null;
          follow();
          canvas.requestRenderAll();
        });
      }
    };

    // Deleting a shape (keyboard, eraser, …) takes its connectors with it.
    // Cards do the same from the overlay layer (useNodeConnectorSync).
    const onRemoved = ({ target }: { target: FabricObject }) => {
      if (isRestoringRef.current || isConnector(target)) return;
      const id = (target as any).id;
      if (!id) return;
      removeConnectorsFor(canvas, new Set([id]));
      if (id === hover?.id) setHover(null);
    };

    // Fabric hit-tests with the bounding box; test the actual route for
    // connectors so clicks in the empty area of an elbow go to what's beneath.
    const originalCheckTarget = (canvas as any)._checkTarget;
    (canvas as any)._checkTarget = function (obj: FabricObject, pointer: Point) {
      if (isConnector(obj)) return obj.visible && obj.evented && obj.containsPoint(pointer);
      return originalCheckTarget.call(this, obj, pointer);
    };

    const moveEvents = [
      "object:moving", "object:scaling", "object:rotating", "object:resizing",
      "object:skewing", "object:modified", "text:changed", "selection:cleared",
    ] as const;

    // Capture on window runs before Fabric's canvas listeners and React's
    // card handlers; isOnBoard keeps the toolbar and panels untouched.
    const swallowed = ["mousedown", "touchstart", "click", "dblclick"] as const;

    moveEvents.forEach((ev) => canvas.on(ev as any, follow));
    canvas.on("selection:created", dropConnectorsFromSelection);
    canvas.on("selection:updated", dropConnectorsFromSelection);
    canvas.on("object:added", onAdded as any);
    canvas.on("object:removed", onRemoved as any);
    canvas.on("mouse:move", onFabricMove);
    canvas.on("after:render", onAfterRender as any);
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    swallowed.forEach((ev) => window.addEventListener(ev, swallow, { capture: true, passive: false }));

    return () => {
      cancelGesture();
      moveEvents.forEach((ev) => canvas.off(ev as any, follow));
      canvas.off("selection:created", dropConnectorsFromSelection);
      canvas.off("selection:updated", dropConnectorsFromSelection);
      canvas.off("object:added", onAdded as any);
      canvas.off("object:removed", onRemoved as any);
      canvas.off("mouse:move", onFabricMove);
      canvas.off("after:render", onAfterRender as any);
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointermove", onPointerMove);
      swallowed.forEach((ev) => window.removeEventListener(ev, swallow, true));
      (canvas as any)._checkTarget = originalCheckTarget;
      setConnectorLayer(canvas, false);
      layer.remove();
      if (refreshRaf !== null) cancelAnimationFrame(refreshRaf);
    };
  }, [fabricCanvas, suppressHistoryRef, isRestoringRef]);

  // Tool switches change whether anchors should show — repaint once.
  useEffect(() => {
    fabricCanvas.current?.requestRenderAll();
  }, [activeTool, fabricCanvas]);
};
