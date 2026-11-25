import { useEffect } from "react";
import type { MutableRefObject, Dispatch, SetStateAction } from "react";
import type { WhiteboardNode } from "../../../types/canvas-node";

interface UseSelectionBoxProps {
  selectionBox: { x1: number; y1: number; x2: number; y2: number } | null;
  localNodes: WhiteboardNode[];
  /** Measured node size in world units (from the DOM). */
  getNodeSize: (id: string) => { width: number; height: number };
  canvasZoom: number;
  canvasViewport: { x: number; y: number };
  isSelectionBoxActiveRef: MutableRefObject<boolean>;
  htmlNodesSelectedByBoxRef: MutableRefObject<boolean>;
  setSelectedIds: Dispatch<SetStateAction<Set<string>>>;
}

function hitTest(
  x: number,
  y: number,
  width: number,
  height: number,
  box: { x1: number; y1: number; x2: number; y2: number },
  zoom: number,
  viewport: { x: number; y: number }
): boolean {
  const itemX1 = x * zoom + viewport.x;
  const itemY1 = y * zoom + viewport.y;
  const itemX2 = itemX1 + width * zoom;
  const itemY2 = itemY1 + height * zoom;

  const bx1 = Math.min(box.x1, box.x2);
  const by1 = Math.min(box.y1, box.y2);
  const bx2 = Math.max(box.x1, box.x2);
  const by2 = Math.max(box.y1, box.y2);

  return !(bx2 < itemX1 || bx1 > itemX2 || by2 < itemY1 || by1 > itemY2);
}

/**
 * SRP: detects which HTML nodes fall inside the rubber-band selection box and
 * updates selectedIds. Also maintains the guard refs so Fabric event handlers
 * know not to clobber the box selection while it is active.
 *
 * O(n) single pass with an early-exit equality check avoids unnecessary
 * re-renders when the selection set hasn't actually changed.
 */
export function useSelectionBox({
  selectionBox,
  localNodes,
  getNodeSize,
  canvasZoom,
  canvasViewport,
  isSelectionBoxActiveRef,
  htmlNodesSelectedByBoxRef,
  setSelectedIds,
}: UseSelectionBoxProps) {
  useEffect(() => {
    if (!selectionBox) {
      isSelectionBoxActiveRef.current = false;
      return;
    }

    isSelectionBoxActiveRef.current = true;
    const newSelected = new Set<string>();

    for (const node of localNodes) {
      const { width, height } = getNodeSize(node.id);
      if (hitTest(node.x, node.y, width, height, selectionBox, canvasZoom, canvasViewport))
        newSelected.add(node.id);
    }

    setSelectedIds((prev) => {
      if (prev.size !== newSelected.size) {
        htmlNodesSelectedByBoxRef.current = newSelected.size > 0;
        return newSelected;
      }
      for (const id of newSelected) {
        if (!prev.has(id)) {
          htmlNodesSelectedByBoxRef.current = newSelected.size > 0;
          return newSelected;
        }
      }
      return prev;
    });
  }, [selectionBox, localNodes, getNodeSize, canvasZoom, canvasViewport]);
}
