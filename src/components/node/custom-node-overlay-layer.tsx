"use client";

// HTML overlay orchestrator — renders consumer-defined node components in canvas world-space and owns their drag, selection and stacking.

import React, { useRef, useCallback, useMemo } from "react";
import type { CanvasOverlayLayerProps } from "./types/overlay-types";
import type { NodeProps, NodeTypeDefinition, WhiteboardNode } from "../../types/canvas-node";
import { useNodeState } from "./hooks/useNodeState";
import { useNodeSelection } from "./hooks/useNodeSelection";
import { useNodeDrag } from "./hooks/useNodeDrag";
import { useFabricSync } from "./hooks/useFabricSync";
import { useWheelZoom } from "./hooks/useWheelZoom";
import { useSelectionBox } from "./hooks/useSelectionBox";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useNodeConnectorSync } from "./hooks/useNodeConnectorSync";
import { useWhiteboardStore } from "../../store/whiteboard-store";

/**
 * Pointer-downs on these never start a drag, so form controls and links inside
 * custom nodes keep working. Consumers add `className="nodrag"` to anything else.
 */
const NO_DRAG_SELECTOR =
  '.nodrag, input, textarea, select, button, a[href], [contenteditable=""], [contenteditable="true"]';

function UnknownNode({ type }: { type: string }) {
  return (
    <div className="px-3 py-2 rounded-lg border border-dashed border-neutral-500 bg-neutral-900 text-xs text-neutral-400">
      Unknown node type “{type}”
    </div>
  );
}

// ── One node: memoized so moving or selecting one node doesn't re-render the others ──
interface NodeItemProps {
  node: WhiteboardNode;
  def: NodeTypeDefinition | undefined;
  selected: boolean;
  dragging: boolean;
  editable: boolean;
  onPointerStart: (node: WhiteboardNode, e: React.MouseEvent | React.TouchEvent) => void;
  updateData: (id: string, patch: any) => void;
  remove: (id: string) => void;
}

const NodeItem = React.memo(function NodeItem({
  node, def, selected, dragging, editable, onPointerStart, updateData, remove,
}: NodeItemProps) {
  const Component = def?.component;
  const props: NodeProps = {
    id: node.id,
    type: node.type,
    data: node.data,
    selected,
    dragging,
    editable,
    updateData: (patch) => updateData(node.id, patch),
    remove: () => remove(node.id),
  };

  return (
    <div
      onMouseDown={(e) => onPointerStart(node, e)}
      onTouchStart={(e) => onPointerStart(node, e)}
      className="wb-node"
      data-selected={selected || undefined}
      data-dragging={dragging || undefined}
      style={{ cursor: editable && !def?.dragHandle ? (dragging ? "grabbing" : "grab") : undefined }}
    >
      {Component ? <Component {...props} /> : <UnknownNode type={node.type} />}
    </div>
  );
});

export default React.memo(function CanvasOverlayLayer({
  nodes,
  nodeTypes,
  onNodesUpdate,
  liveNodesRef,
  canvasZoom = 1,
  canvasViewport = { x: 0, y: 0 },
  selectionBox = null,
  fabricCanvas,
  canvasReady: canvasReadyProp = false,
  clearHtmlSelectionRef,
}: CanvasOverlayLayerProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const editable = useWhiteboardStore((s) => s.editable);
  const editableRef = useRef(editable);
  editableRef.current = editable;

  // Nodes only take pointer input with the Select tool. With any other tool
  // events fall through to the canvas, so Hand pans over nodes, and pen
  // strokes and connectors can start on top of them.
  const nodesInteractive = useWhiteboardStore((s) => s.activeTool === "select");

  // ── Data layer ────────────────────────────────────────────────────────────────
  const { localNodes, setLocalNodes, localNodesRef } = useNodeState(nodes);
  if (liveNodesRef) liveNodesRef.current = localNodes;

  const onNodesUpdateRef = useRef(onNodesUpdate);
  onNodesUpdateRef.current = onNodesUpdate;

  /** Apply a change to the local list and hand the result to the parent. */
  const commit = useCallback((next: WhiteboardNode[]) => {
    localNodesRef.current = next;
    setLocalNodes(next);
    onNodesUpdateRef.current?.(next);
  }, [localNodesRef, setLocalNodes]);

  // ── Selection layer ───────────────────────────────────────────────────────────
  const {
    selectedIds, setSelectedIds, selectedIdsRef,
    isHtmlSelectingRef, isSelectionBoxActiveRef, htmlNodesSelectedByBoxRef,
    dragSelectedIdsRef, handleSelect,
  } = useNodeSelection({ fabricCanvas, clearHtmlSelectionRef });

  // ── Drag layer ────────────────────────────────────────────────────────────────
  const { dragging, handleDragStart } = useNodeDrag({
    selectedIdsRef,
    dragSelectedIdsRef,
    htmlNodesSelectedByBoxRef,
    localNodesRef,
    fabricCanvas,
    setLocalNodes,
    onNodesUpdate,
  });

  // ── Fabric→HTML sync ──────────────────────────────────────────────────────────
  useFabricSync({
    fabricCanvas,
    canvasReady: canvasReadyProp,
    dragSelectedIdsRef,
    selectedIdsRef,
    isHtmlSelectingRef,
    isSelectionBoxActiveRef,
    htmlNodesSelectedByBoxRef,
    setSelectedIds,
    setLocalNodes,
    localNodesRef,
    onNodesUpdate,
  });

  // ── Wheel zoom forwarding ─────────────────────────────────────────────────────
  const { handleOverlayWheel } = useWheelZoom({
    overlayRef,
    fabricCanvas,
    canvasReady: canvasReadyProp,
  });

  // ── Connectors: publish node rects so connectors can attach to nodes ─────────
  const { registerNode, getNodeSize } = useNodeConnectorSync({
    fabricCanvas,
    canvasReady: canvasReadyProp,
    localNodes,
    nodeTypes,
  });

  // ── Selection box hit detection ───────────────────────────────────────────────
  useSelectionBox({
    selectionBox,
    localNodes,
    getNodeSize,
    canvasZoom,
    canvasViewport,
    isSelectionBoxActiveRef,
    htmlNodesSelectedByBoxRef,
    setSelectedIds,
  });

  // ── Keyboard shortcuts ────────────────────────────────────────────────────────
  useKeyboardShortcuts({
    localNodesRef,
    selectedIdsRef,
    setSelectedIds,
    setLocalNodes,
    onNodesUpdate,
  });

  // ── Stacking: the most recently added or selected node sits on top ──────────
  const stackRef = useRef({ order: new Map<string, number>(), next: 1 });
  const stackIndex = (id: string) => {
    const stack = stackRef.current;
    if (!stack.order.has(id)) stack.order.set(id, stack.next++);
    return stack.order.get(id)!;
  };
  const bringToTop = useCallback((id: string) => {
    const stack = stackRef.current;
    stack.order.set(id, stack.next++);
  }, []);

  // ── Node callbacks (stable, so memoized nodes don't re-render) ───────────────
  const nodeTypesRef = useRef(nodeTypes);
  nodeTypesRef.current = nodeTypes;

  const handlePointerStart = useCallback(
    (node: WhiteboardNode, e: React.MouseEvent | React.TouchEvent) => {
      const target = e.target as HTMLElement;
      const handle = nodeTypesRef.current[node.type]?.dragHandle;
      const canDrag = !target.closest(NO_DRAG_SELECTOR) && (!handle || !!target.closest(handle));

      bringToTop(node.id);
      // Selecting on a no-drag element is fine, but its default (focus, text
      // caret) must survive, so only drags call preventDefault (in handleDragStart).
      if (canDrag) handleDragStart(node.id, e);
      handleSelect(node.id, e as React.MouseEvent);
    },
    [bringToTop, handleDragStart, handleSelect]
  );

  // Read-only boards never change, so updateData/remove are no-ops there.
  const updateData = useCallback((id: string, patch: any) => {
    if (!editableRef.current) return;
    const next = localNodesRef.current.map((n) => {
      if (n.id !== id) return n;
      const data = typeof patch === "function"
        ? patch(n.data)
        : n.data !== null && typeof n.data === "object" && !Array.isArray(n.data)
          ? { ...n.data, ...patch }
          : patch;
      return { ...n, data };
    });
    commit(next);
  }, [commit, localNodesRef]);

  const remove = useCallback((id: string) => {
    if (!editableRef.current) return;
    if (!localNodesRef.current.some((n) => n.id === id)) return;
    setSelectedIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    commit(localNodesRef.current.filter((n) => n.id !== id));
  }, [commit, localNodesRef, setSelectedIds]);

  // Selection outline scales with zoom so it stays ~2px on screen.
  const outlinePx = useMemo(() => Math.max(1, 2 / canvasZoom), [canvasZoom]);

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 50, ["--wb-node-outline" as any]: `${outlinePx}px` }}
      onWheel={handleOverlayWheel}
      onClick={(e) => {
        if (e.target === e.currentTarget) setSelectedIds(new Set());
      }}
    >
      <div
        className="absolute top-0 left-0 pointer-events-none"
        style={{
          transform: `translate(${canvasViewport.x}px, ${canvasViewport.y}px) scale(${canvasZoom})`,
          transformOrigin: "top left",
        }}
      >
        {localNodes.map((node) => {
          const isDragging = !!dragging?.itemIds.includes(node.id);
          return (
            <div
              key={node.id}
              ref={registerNode(node.id)}
              data-whiteboard-node={node.id}
              className={`${nodesInteractive ? "pointer-events-auto" : "pointer-events-none"} absolute`}
              style={{
                left: 0,
                top: 0,
                transform: `translate3d(${node.x}px, ${node.y}px, 0)`,
                transformOrigin: "top left",
                transition: "none",
                willChange: "transform",
                // Dragged nodes float above everything; others follow stacking order.
                zIndex: isDragging ? 1_000_000 : stackIndex(node.id),
              }}
            >
              <NodeItem
                node={node}
                def={nodeTypes[node.type]}
                selected={selectedIds.has(node.id)}
                dragging={isDragging}
                editable={editable}
                onPointerStart={handlePointerStart}
                updateData={updateData}
                remove={remove}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}, (prev, next) =>
  prev.nodes === next.nodes &&
  prev.nodeTypes === next.nodeTypes &&
  prev.canvasZoom === next.canvasZoom &&
  prev.canvasViewport?.x === next.canvasViewport?.x &&
  prev.canvasViewport?.y === next.canvasViewport?.y &&
  prev.selectionBox === next.selectionBox &&
  prev.selectedCanvasObjects === next.selectedCanvasObjects &&
  prev.onNodesUpdate === next.onNodesUpdate &&
  prev.canvasReady === next.canvasReady
  // fabricCanvas and liveNodesRef are stable ref objects — intentionally omitted
);
