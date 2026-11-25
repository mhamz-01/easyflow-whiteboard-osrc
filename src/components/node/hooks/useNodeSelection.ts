import { useState, useRef, useEffect, useCallback } from "react";
import type {
  RefObject,
  MutableRefObject,
  MouseEvent as ReactMouseEvent,
} from "react";
import type { Canvas } from "fabric";

interface UseNodeSelectionProps {
  fabricCanvas?: RefObject<Canvas | null>;
  clearHtmlSelectionRef?: MutableRefObject<() => void>;
}

/**
 * SRP: owns the selectedIds set and all coordination guard refs that
 * prevent feedback loops between HTML-node selection and Fabric selection.
 *
 * Guard refs:
 *  isHtmlSelectingRef        — HTML node is the initiator; Fabric listeners should skip
 *  isSelectionBoxActiveRef   — rubber-band box is live; Fabric mouse:down should skip
 *  htmlNodesSelectedByBoxRef — box just selected HTML nodes; Fabric selection:created should skip
 *  dragSelectedIdsRef        — snapshot of selection at the moment a drag begins
 */
export function useNodeSelection({
  fabricCanvas,
  clearHtmlSelectionRef,
}: UseNodeSelectionProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const selectedIdsRef = useRef<Set<string>>(selectedIds);
  const isHtmlSelectingRef = useRef(false);
  const isSelectionBoxActiveRef = useRef(false);
  const htmlNodesSelectedByBoxRef = useRef(false);
  const dragSelectedIdsRef = useRef<Set<string>>(new Set());

  selectedIdsRef.current = selectedIds;

  useEffect(() => {
    if (!clearHtmlSelectionRef) return;
    clearHtmlSelectionRef.current = () => setSelectedIds(new Set());
  }, [clearHtmlSelectionRef]);

  const handleSelect = useCallback(
    (id: string, e?: ReactMouseEvent) => {
      const canvas = fabricCanvas?.current;
      if (canvas) {
        isHtmlSelectingRef.current = true;
        canvas.discardActiveObject();
        canvas.requestRenderAll();
        isHtmlSelectingRef.current = false;
      }

      htmlNodesSelectedByBoxRef.current = false;

      if (e?.shiftKey || e?.ctrlKey || e?.metaKey) {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.has(id) ? next.delete(id) : next.add(id);
          return next;
        });
      } else {
        setSelectedIds(new Set([id]));
      }
    },
    [fabricCanvas]
  );

  return {
    selectedIds,
    setSelectedIds,
    selectedIdsRef,
    isHtmlSelectingRef,
    isSelectionBoxActiveRef,
    htmlNodesSelectedByBoxRef,
    dragSelectedIdsRef,
    handleSelect,
  };
}
