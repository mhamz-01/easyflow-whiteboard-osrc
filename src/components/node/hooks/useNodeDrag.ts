import { useState, useRef, useCallback, useEffect } from "react";
import type {
  RefObject,
  MutableRefObject,
  Dispatch,
  SetStateAction,
  MouseEvent as ReactMouseEvent,
  TouchEvent as ReactTouchEvent,
} from "react";
import { FabricObject } from "fabric";
import type { Canvas } from "fabric";
import type { DragState, PointerCoords } from "../types/overlay-types";
import type { WhiteboardNode } from "../../../types/canvas-node";
import { useWhiteboardStore } from "../../../store/whiteboard-store";

interface UseNodeDragProps {
  selectedIdsRef: MutableRefObject<Set<string>>;
  dragSelectedIdsRef: MutableRefObject<Set<string>>;
  htmlNodesSelectedByBoxRef: MutableRefObject<boolean>;
  localNodesRef: MutableRefObject<WhiteboardNode[]>;
  fabricCanvas?: RefObject<Canvas | null>;
  setLocalNodes: Dispatch<SetStateAction<WhiteboardNode[]>>;
  onNodesUpdate?: (nodes: WhiteboardNode[]) => void;
}

function readPointer(
  e: ReactMouseEvent | ReactTouchEvent | MouseEvent | TouchEvent
): PointerCoords {
  if ("touches" in e && e.touches.length > 0) {
    return { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY };
  }
  return {
    clientX: (e as MouseEvent | ReactMouseEvent).clientX,
    clientY: (e as MouseEvent | ReactMouseEvent).clientY,
  };
}

/**
 * SRP: owns the full HTML-node drag lifecycle — start, move (rAF-throttled),
 * and end — while keeping Fabric canvas objects in sync imperatively.
 *
 * Key design decisions:
 *  - All world-space math reads live viewport transform from Fabric so zoom/pan
 *    during a drag stays correct without extra state dependencies.
 *  - startPositions + anchor-offset approach prevents the "jump on drag start"
 *    bug that occurs when using raw mouse coords.
 *  - Fabric object positions are read via queueMicrotask (after discardActiveObject)
 *    so they are always in ground-truth world coords, immune to Fabric v6's
 *    matrix-decomposition vs matrix-multiplication divergence.
 */
export function useNodeDrag({
  selectedIdsRef,
  dragSelectedIdsRef,
  htmlNodesSelectedByBoxRef,
  localNodesRef,
  fabricCanvas,
  setLocalNodes,
  onNodesUpdate,
}: UseNodeDragProps) {
  const editable = useWhiteboardStore((s) => s.editable);
  const [dragging, setDragging] = useState<{ itemIds: string[] } | null>(null);

  const dragStateRef = useRef<DragState>({
    isDragging: false,
    moved: false,
    itemIds: [],
    startPositions: new Map(),
    canvasObjectsStartPos: new Map(),
    offsetX: 0,
    offsetY: 0,
  });

  const rafIdRef = useRef<number | null>(null);
  const onNodesUpdateRef = useRef(onNodesUpdate);
  onNodesUpdateRef.current = onNodesUpdate;

  const getItemPosition = useCallback(
    (id: string): { x: number; y: number } | undefined => {
      const node = localNodesRef.current.find((n) => n.id === id);
      return node ? { x: node.x, y: node.y } : undefined;
    },
    [localNodesRef]
  );

  const handleDragStart = useCallback(
    (itemId: string, e: ReactMouseEvent | ReactTouchEvent) => {
      if (!editable) return;
      const canvas = fabricCanvas?.current;
      if (!canvas) return;

      if (e.cancelable) e.preventDefault();
      const pointer = readPointer(e);

      // The clicked item MUST be first so handleMove's anchor calculation is correct.
      // offsetX/Y is relative to itemId's position, and handleMove reads firstStart
      // from itemIds[0] — they must be the same node.
      const itemsToDrag: string[] = selectedIdsRef.current.has(itemId)
        ? [itemId, ...Array.from(selectedIdsRef.current).filter((id) => id !== itemId)]
        : [itemId];

      const vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
      const liveZoom = vpt[0];
      const liveVpX = vpt[4];
      const liveVpY = vpt[5];

      const clickWorldX = (pointer.clientX - liveVpX) / liveZoom;
      const clickWorldY = (pointer.clientY - liveVpY) / liveZoom;

      const clickedPos = getItemPosition(itemId);
      if (!clickedPos) return;

      // Offset in world units: distance from mouse to node's top-left.
      // Stays constant even when zooming during a drag.
      const worldOffsetX = clickWorldX - clickedPos.x;
      const worldOffsetY = clickWorldY - clickedPos.y;

      const startPositions = new Map<string, { x: number; y: number }>();
      itemsToDrag.forEach((id) => {
        const pos = getItemPosition(id);
        if (pos) startPositions.set(id, pos);
      });

      // Capture Fabric object references NOW (before handleSelect fires
      // discardActiveObject), but read their actual left/top positions via a
      // queueMicrotask that runs AFTER discardActiveObject() has restored every
      // object to true world coordinates, yet BEFORE any requestAnimationFrame
      // callback (where handleMove runs).
      //
      // Why not calcTransformMatrix() here?
      // In Fabric v6 the matrix-multiplication path (calcTransformMatrix) and
      // the matrix-decomposition path (ActiveSelection.destroy) are independent
      // algorithms. They can diverge when objects carry scale, strokeUniform, or
      // accumulated float rounding — causing a visible position jump on frame 1.
      // Reading obj.left/top after discard is the ground-truth value: no
      // prediction, no mismatch.
      // Only sync Fabric objects that were co-selected with HTML nodes via a
      // joint box selection. If the user independently clicked a Fabric object
      // and then starts dragging a custom node, those Fabric objects must stay.
      const liveActiveObjects = htmlNodesSelectedByBoxRef.current
        ? canvas.getActiveObjects()
        : [];
      const canvasObjectsStartPos = new Map<FabricObject, { left: number; top: number }>();
      const objectsToSync = [...liveActiveObjects];

      if (objectsToSync.length > 0) {
        queueMicrotask(() => {
          if (!dragStateRef.current.isDragging) return;
          objectsToSync.forEach((obj) => {
            dragStateRef.current.canvasObjectsStartPos.set(obj, {
              left: obj.left || 0,
              top: obj.top || 0,
            });
          });
        });
      }

      dragStateRef.current = {
        isDragging: true,
        moved: false,
        itemIds: itemsToDrag,
        startPositions,
        canvasObjectsStartPos,
        offsetX: worldOffsetX,
        offsetY: worldOffsetY,
      };

      dragSelectedIdsRef.current = new Set(itemsToDrag);

      setDragging({ itemIds: itemsToDrag });
      document.body.style.cursor = "grabbing";
      document.body.style.userSelect = "none";
      document.body.style.touchAction = "none";
    },
    [fabricCanvas, selectedIdsRef, dragSelectedIdsRef, getItemPosition, editable]
  );

  // Attach move/end listeners only while a drag is active (SRP for side effects).
  useEffect(() => {
    if (!dragging) return;

    const handleMove = (e: MouseEvent | TouchEvent) => {
      if (!dragStateRef.current.isDragging) return;
      if (e.cancelable) e.preventDefault();

      const pointer = readPointer(e);

      if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);

      rafIdRef.current = requestAnimationFrame(() => {
        const { itemIds, startPositions, canvasObjectsStartPos, offsetX, offsetY } =
          dragStateRef.current;

        const canvas = fabricCanvas?.current;
        if (!canvas) return;

        const vpt = canvas.viewportTransform!;
        const currentWorldX = (pointer.clientX - vpt[4]) / vpt[0];
        const currentWorldY = (pointer.clientY - vpt[5]) / vpt[0];

        // itemIds[0] is always the clicked node (guaranteed by handleDragStart).
        // offsetX/Y is relative to that same node, so the anchor is consistent.
        const firstStart = startPositions.get(itemIds[0]);
        if (!firstStart) return;

        const deltaX = currentWorldX - offsetX - firstStart.x;
        const deltaY = currentWorldY - offsetY - firstStart.y;

        // O(1) Set lookup — critical for 100+ node selections.
        const itemIdSet = new Set(itemIds);

        if (deltaX !== 0 || deltaY !== 0) dragStateRef.current.moved = true;

        setLocalNodes((prev) =>
          prev.map((n) => {
            const sp = startPositions.get(n.id);
            return sp && itemIdSet.has(n.id)
              ? { ...n, x: sp.x + deltaX, y: sp.y + deltaY }
              : n;
          })
        );

        // Move Fabric objects in sync. setCoords() updates hit-testing after
        // the imperative position change.
        canvasObjectsStartPos.forEach((startPos, obj) => {
          obj.set({ left: startPos.left + deltaX, top: startPos.top + deltaY });
          obj.setCoords();
        });

        canvas.requestRenderAll();
      });
    };

    const handleEnd = () => {
      if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
      dragStateRef.current.isDragging = false;
      dragSelectedIdsRef.current = new Set();
      setDragging(null);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.body.style.touchAction = "";

      // A plain click (no movement) is not a change: don't notify the parent.
      if (!dragStateRef.current.moved) return;
      dragStateRef.current.moved = false;

      // Commit after the last rAF's state update has landed so the parent
      // receives the final positions.
      requestAnimationFrame(() => onNodesUpdateRef.current?.(localNodesRef.current));
    };

    window.addEventListener("mousemove", handleMove, { passive: false });
    window.addEventListener("mouseup", handleEnd);
    window.addEventListener("touchmove", handleMove, { passive: false });
    window.addEventListener("touchend", handleEnd);
    window.addEventListener("touchcancel", handleEnd);

    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleEnd);
      window.removeEventListener("touchmove", handleMove);
      window.removeEventListener("touchend", handleEnd);
      window.removeEventListener("touchcancel", handleEnd);
    };
  }, [dragging, fabricCanvas]);

  return { dragging, getItemPosition, handleDragStart };
}
