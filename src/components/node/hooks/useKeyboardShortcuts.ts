import { useEffect, useRef } from "react";
import type { MutableRefObject, Dispatch, SetStateAction } from "react";
import type { WhiteboardNode } from "../../../types/canvas-node";
import { useWhiteboardStore } from "../../../store/whiteboard-store";
import { isTypingTarget } from "../../../lib/utils";

interface UseKeyboardShortcutsProps {
  localNodesRef: MutableRefObject<WhiteboardNode[]>;
  selectedIdsRef: MutableRefObject<Set<string>>;
  setSelectedIds: Dispatch<SetStateAction<Set<string>>>;
  setLocalNodes: Dispatch<SetStateAction<WhiteboardNode[]>>;
  onNodesUpdate?: (nodes: WhiteboardNode[]) => void;
}

/**
 * Global keyboard shortcuts for the overlay. Reads refs so the listener is
 * registered once instead of on every selection or data change.
 *
 *  Ctrl/Cmd+A        select all HTML nodes
 *  Escape            clear selection
 *  Delete/Backspace  delete selected nodes
 *
 * Keys typed inside inputs or contenteditable elements (including ones inside
 * custom nodes) are ignored.
 */
export function useKeyboardShortcuts({
  localNodesRef,
  selectedIdsRef,
  setSelectedIds,
  setLocalNodes,
  onNodesUpdate,
}: UseKeyboardShortcutsProps) {
  const editable = useWhiteboardStore((s) => s.editable);
  const onNodesUpdateRef = useRef(onNodesUpdate);
  onNodesUpdateRef.current = onNodesUpdate;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;

      if ((e.ctrlKey || e.metaKey) && e.key === "a") {
        e.preventDefault();
        setSelectedIds(new Set(localNodesRef.current.map((n) => n.id)));
        return;
      }

      if (e.key === "Escape") {
        setSelectedIds(new Set());
        return;
      }

      if ((e.key === "Delete" || e.key === "Backspace") && selectedIdsRef.current.size > 0) {
        if (!editable) return;
        e.preventDefault();
        const sel = selectedIdsRef.current;
        const updated = localNodesRef.current.filter((n) => !sel.has(n.id));
        setLocalNodes(updated);
        setSelectedIds(new Set());
        onNodesUpdateRef.current?.(updated);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editable]);
}
