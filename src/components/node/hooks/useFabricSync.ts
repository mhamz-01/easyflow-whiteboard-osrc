import { useEffect, useRef } from "react";
import type { RefObject, MutableRefObject, Dispatch, SetStateAction } from "react";
import type { Canvas } from "fabric";
import type { WhiteboardNode } from "../../../types/canvas-node";

interface UseFabricSyncProps {
  fabricCanvas?: RefObject<Canvas | null>;
  canvasReady: boolean;
  dragSelectedIdsRef: MutableRefObject<Set<string>>;
  selectedIdsRef: MutableRefObject<Set<string>>;
  isHtmlSelectingRef: MutableRefObject<boolean>;
  isSelectionBoxActiveRef: MutableRefObject<boolean>;
  htmlNodesSelectedByBoxRef: MutableRefObject<boolean>;
  setSelectedIds: Dispatch<SetStateAction<Set<string>>>;
  setLocalNodes: Dispatch<SetStateAction<WhiteboardNode[]>>;
  localNodesRef: MutableRefObject<WhiteboardNode[]>;
  onNodesUpdate?: (nodes: WhiteboardNode[]) => void;
}

/**
 * SRP: listens to Fabric canvas events and propagates changes to the HTML overlay.
 *
 * object:moving  — mirrors Fabric drag onto HTML node positions (rAF-throttled).
 *                  Uses an accumulated-delta ref so no frames are ever lost even
 *                  when multiple mousemove events fire within one display frame.
 * mouse:down     — snapshots drag selection; clears HTML selection for Fabric drags.
 * selection:created / selection:updated — clear HTML selection when Fabric owns it.
 *
 * Three correctness invariants maintained here:
 *
 *  1. _prevLeft/Top is tracked on the ACTIVE OBJECT (which may be an activeSelection
 *     group), not on `e.target` (which may be a member of the group). Both
 *     `mouse:down` and `object:moving` must agree on which object they track.
 *
 *  2. Deltas are ACCUMULATED in a ref between RAF frames. When the RAF guard blocks
 *     a frame, the delta is NOT discarded — it is added to the pending accumulator
 *     and flushed in the next RAF callback. This prevents HTML nodes from drifting
 *     behind Fabric objects during fast drags.
 *
 *  3. Guard refs (isHtmlSelecting, isSelectionBoxActive, htmlNodesSelectedByBox)
 *     prevent feedback loops between the two selection systems.
 */
export function useFabricSync({
  fabricCanvas,
  canvasReady,
  dragSelectedIdsRef,
  selectedIdsRef,
  isHtmlSelectingRef,
  isSelectionBoxActiveRef,
  htmlNodesSelectedByBoxRef,
  setSelectedIds,
  setLocalNodes,
  localNodesRef,
  onNodesUpdate,
}: UseFabricSyncProps) {
  const onNodesUpdateRef = useRef(onNodesUpdate);
  onNodesUpdateRef.current = onNodesUpdate;
  // Set when a Fabric drag carried HTML nodes along; committed on mouse:up.
  const nodesMovedRef = useRef(false);
  const fabricMoveRafRef = useRef<number | null>(null);
  // Accumulates ALL deltas between RAF frames so none are ever dropped.
  const pendingDelta = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const canvas = fabricCanvas?.current;
    if (!canvas) return;

    const handleObjectMoving = (e: any) => {
      // e.transform.target is the object actually being dragged by Fabric's
      // interaction system. For an activeSelection it is the GROUP, not a member.
      const target = e.transform?.target || e.target;
      if (!target) return;

      const deltaX = target.left - (target._prevLeft ?? target.left);
      const deltaY = target.top - (target._prevTop ?? target.top);
      target._prevLeft = target.left;
      target._prevTop = target.top;
      if (deltaX === 0 && deltaY === 0) return;

      // Always accumulate — even when the RAF guard is active.
      // This is the key fix for Bug 3: no delta is ever lost.
      pendingDelta.current.x += deltaX;
      pendingDelta.current.y += deltaY;

      if (fabricMoveRafRef.current !== null) return;

      fabricMoveRafRef.current = requestAnimationFrame(() => {
        fabricMoveRafRef.current = null;

        // Drain the accumulator atomically.
        const dx = pendingDelta.current.x;
        const dy = pendingDelta.current.y;
        pendingDelta.current.x = 0;
        pendingDelta.current.y = 0;

        const sel = dragSelectedIdsRef.current;

        if (sel.size === 0) return;
        nodesMovedRef.current = true;
        setLocalNodes((prev) =>
          prev.map((n) => (sel.has(n.id) ? { ...n, x: n.x + dx, y: n.y + dy } : n))
        );
      });
    };

    const handleMouseDown = (e: any) => {
      // Bug 2 fix: track _prevLeft on the ACTIVE OBJECT, not e.target.
      //
      // When multiple objects are selected (activeSelection), Fabric fires
      // object:moving with target = the activeSelection GROUP.  But e.target in
      // mouse:down can be an individual member object.  If we set _prevLeft on
      // the member and then object:moving reads it from the group, _prevLeft is
      // undefined → first-frame delta is always 0 → HTML nodes don't move on
      // frame 1 → visible drift at the start of every Fabric drag.
      //
      // canvas.getActiveObject() returns the activeSelection when multiple
      // objects are selected, which is exactly what object:moving will give us.
      const activeObj = canvas.getActiveObject();
      const trackTarget = activeObj ?? e.target;
      if (trackTarget) {
        trackTarget._prevLeft = trackTarget.left;
        trackTarget._prevTop = trackTarget.top;
      }

      // Reset the delta accumulator on every new drag.
      pendingDelta.current.x = 0;
      pendingDelta.current.y = 0;

      const target = e.target;
      const activeObjects = canvas.getActiveObjects();
      const isClickingIntoActiveSelection =
        target && activeObjects.length > 1 && activeObjects.includes(target);

      // Only carry HTML nodes along with the Fabric drag when they were
      // co-selected as part of the SAME coordinated box-selection
      // (htmlNodesSelectedByBoxRef = true). If the user clicked an HTML node
      // independently and then clicks a Fabric object, handleSelect has already
      // reset htmlNodesSelectedByBoxRef to false, so the custom node must NOT
      // follow the Fabric drag.
      const htmlNodesToSync = htmlNodesSelectedByBoxRef.current
        ? new Set(selectedIdsRef.current)
        : new Set<string>();

      if (isClickingIntoActiveSelection) {
        dragSelectedIdsRef.current = htmlNodesToSync;
        return;
      }

      if (isSelectionBoxActiveRef.current) return;
      dragSelectedIdsRef.current = htmlNodesToSync;
      htmlNodesSelectedByBoxRef.current = false;
      setSelectedIds(new Set());
    };

    // The overlay only moved its local copy during the Fabric drag; tell the
    // parent once the gesture ends so the new positions are saved.
    const handleMouseUp = () => {
      if (!nodesMovedRef.current) return;
      nodesMovedRef.current = false;
      requestAnimationFrame(() => onNodesUpdateRef.current?.(localNodesRef.current));
    };

    const handleSelectionCreated = () => {
      if (isHtmlSelectingRef.current) return;
      if (isSelectionBoxActiveRef.current) return;
      if (htmlNodesSelectedByBoxRef.current) return;
      setSelectedIds(new Set());
    };

    const handleSelectionUpdated = () => {
      if (isHtmlSelectingRef.current) return;
      if (isSelectionBoxActiveRef.current) return;
      if (htmlNodesSelectedByBoxRef.current) return;
      setSelectedIds(new Set());
    };

    canvas.on("object:moving", handleObjectMoving);
    canvas.on("mouse:down", handleMouseDown);
    canvas.on("mouse:up", handleMouseUp);
    canvas.on("selection:created", handleSelectionCreated);
    canvas.on("selection:updated", handleSelectionUpdated);

    return () => {
      canvas.off("object:moving", handleObjectMoving);
      canvas.off("mouse:down", handleMouseDown);
      canvas.off("mouse:up", handleMouseUp);
      canvas.off("selection:created", handleSelectionCreated);
      canvas.off("selection:updated", handleSelectionUpdated);
      if (fabricMoveRafRef.current !== null) {
        cancelAnimationFrame(fabricMoveRafRef.current);
      }
    };
  }, [fabricCanvas, canvasReady]);
}
