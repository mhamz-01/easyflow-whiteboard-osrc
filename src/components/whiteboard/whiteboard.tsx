"use client";

// Root whiteboard component — composes all canvas hooks, the memoized toolbar, the HTML node overlay, zoom controls and minimap into a full editor.

import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import fabric, { Canvas, FabricObject, Circle, classRegistry } from "fabric";
import { useWhiteboardStore } from "../../store/whiteboard-store";
import WhiteboardToolbar from "../toolbar/whiteboard-toolbar";
import ToolOptionsPanel from "../toolbar/tooloptions-panel";
import CanvasOverlayLayer from "../node/custom-node-overlay-layer";
import ZoomControls from "../zoomcontrol/zoom-control";
import Minimap from "../minimap/minimap";
import { Frame } from "../../lib/fabric-frame";
import { createObjectId } from "../../lib/fabric-connector";
import { insertableTypes, type InsertMenuItem } from "../toolbar/insert-menu";
import type { ResolvedTheme } from "../../lib/design-tokens";
import type {
  AddNodeInput, NodeTypes, WhiteboardHandle, WhiteboardNode,
} from "../../types/canvas-node";

// Import all hooks
import { useCanvasInit, type WhiteboardInitialData } from "../../hooks/useCanvasInit";
import { useToolManager } from "../../hooks/useToolManager";
import { useDrawing } from "../../hooks/useDrawing";
import { useEraser } from "../../hooks/useEraser";
import { usePan } from "../../hooks/usePan";
import { useZoom } from "../../hooks/useZoom";
import { useSelection } from "../../hooks/useSelection";
import { useTextStyle } from "../../hooks/useTextStyle";
import { useLiveUpdate } from "../../hooks/useLiveUpdate";
import { useMouseHandlers } from "../../hooks/useMouseHandlers";
import { usePersistence, type WhiteboardSavePayload } from "../../hooks/usePersistance";
import { ToolbarSkeleton } from "../toolbar/toolbar-skeleton/toolbar-skeleton";
import { useCopyPaste } from "../../hooks/useCopyPaste";
import { useConnectors } from "../../hooks/useConnectors";

// Re-export types consumers need when wiring initialData / onSave
export type { WhiteboardInitialData } from "../../hooks/useCanvasInit";
export type { WhiteboardSavePayload } from "../../hooks/usePersistance";

// ─── Types ────────────────────────────────────────────────────────────────────

export type WhiteboardTheme = "dark" | "light" | "system";

export interface WhiteboardProps {
  /** Your node components, keyed by type. Define it outside your component (or memoize it). */
  nodeTypes?: NodeTypes;
  /** Controlled nodes. Omit to let the board own them (seeded from `initialData.nodes`). */
  nodes?: WhiteboardNode[];
  /** Called with the full node list after every add, move, edit or delete. */
  onNodesChange?: (nodes: WhiteboardNode[]) => void;
  /** Saved board to restore: the `canvas` and `nodes` from an earlier `onSave`. */
  initialData?: WhiteboardInitialData;
  /** Debounced callback with everything needed to restore the board. */
  onSave?: (payload: WhiteboardSavePayload) => void;
  /** Debounce delay for `onSave`, in ms. Defaults to 2000. */
  saveDebounceMs?: number;
  /** While true, shows a toolbar skeleton and waits before loading `initialData`. */
  isLoadingData?: boolean;
  /** When false, the board is read-only: nothing can be drawn, moved, edited or deleted. Defaults to true. */
  editable?: boolean;
  /** Show the navigation minimap (bottom-right, hidden on small screens). Defaults to true. */
  showMinimap?: boolean;
  /** Colour theme. "system" follows the OS setting. Defaults to "dark". */
  theme?: WhiteboardTheme;
}

const EMPTY_NODE_TYPES: NodeTypes = {};

classRegistry.setClass(Frame, "frame");

/** Resolves "system" against the OS colour scheme and follows changes to it. */
function useResolvedTheme(theme: WhiteboardTheme): ResolvedTheme {
  const query = "(prefers-color-scheme: light)";
  const [systemLight, setSystemLight] = useState(false);

  useEffect(() => {
    if (theme !== "system" || typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    setSystemLight(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setSystemLight(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [theme]);

  if (theme === "system") return systemLight ? "light" : "dark";
  return theme;
}

// ── Memoized Toolbar wrapper ──────────────────────────────────────────────────
const MemoizedToolbarWrapper = React.memo(function ToolbarWrapper({
  canvasReady,
  fabricCanvasRef,
  isRestoringRef,
  insertItems,
  onInsertNode,
}: {
  canvasReady: boolean;
  fabricCanvasRef: React.RefObject<Canvas | null>;
  isRestoringRef: React.MutableRefObject<boolean>;
  insertItems: InsertMenuItem[];
  onInsertNode: (type: string) => void;
}) {
  return canvasReady ? (
    <WhiteboardToolbar
      fabricCanvas={fabricCanvasRef as React.MutableRefObject<Canvas | null>}
      isRestoringRef={isRestoringRef}
      insertItems={insertItems}
      onInsertNode={onInsertNode}
    />
  ) : (
    <ToolbarSkeleton />
  );
});

// ── Memoized Overlay wrapper ──────────────────────────────────────────────────
// Re-renders only when nodes, selection or readiness change — not on every
// pan/zoom frame (the overlay reads zoom/viewport from the canvas itself).
const MemoizedOverlayWrapper = React.memo(function OverlayWrapper({
  nodes,
  nodeTypes,
  canvasReady,
  fabricCanvasRef,
  onNodesUpdate,
  liveNodesRef,
  selectionBox,
  selectedCanvasObjects,
  clearHtmlSelectionRef,
}: {
  nodes: WhiteboardNode[];
  nodeTypes: NodeTypes;
  canvasReady: boolean;
  fabricCanvasRef: React.RefObject<Canvas | null>;
  onNodesUpdate: (nodes: WhiteboardNode[]) => void;
  liveNodesRef: React.MutableRefObject<WhiteboardNode[]>;
  selectionBox: { x1: number; y1: number; x2: number; y2: number } | null;
  selectedCanvasObjects: FabricObject[];
  clearHtmlSelectionRef: React.MutableRefObject<() => void>;
}) {
  const [canvasZoom, setCanvasZoom] = useState(1);
  const [canvasViewport, setCanvasViewport] = useState({ x: 0, y: 0 });

  React.useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    const updateViewport = () => {
      const vpt = canvas.viewportTransform;
      if (!vpt) return;
      setCanvasZoom(vpt[0]);
      setCanvasViewport({ x: vpt[4], y: vpt[5] });
    };

    canvas.on("after:render", updateViewport);
    updateViewport();

    return () => {
      canvas.off("after:render", updateViewport);
    };
  }, [fabricCanvasRef, canvasReady]);

  return (
    <CanvasOverlayLayer
      nodes={nodes}
      nodeTypes={nodeTypes}
      onNodesUpdate={onNodesUpdate}
      liveNodesRef={liveNodesRef}
      canvasZoom={canvasZoom}
      canvasViewport={canvasViewport}
      fabricCanvas={fabricCanvasRef}
      canvasReady={canvasReady}
      selectionBox={selectionBox}
      selectedCanvasObjects={selectedCanvasObjects}
      clearHtmlSelectionRef={clearHtmlSelectionRef}
    />
  );
}, (prev, next) => (
  prev.nodes === next.nodes &&
  prev.nodeTypes === next.nodeTypes &&
  prev.canvasReady === next.canvasReady &&
  prev.fabricCanvasRef === next.fabricCanvasRef &&
  prev.onNodesUpdate === next.onNodesUpdate &&
  prev.selectionBox === next.selectionBox &&
  prev.selectedCanvasObjects === next.selectedCanvasObjects
));

const Whiteboard = forwardRef<WhiteboardHandle, WhiteboardProps>(function Whiteboard({
  nodeTypes = EMPTY_NODE_TYPES,
  nodes: nodesProp,
  onNodesChange,
  initialData,
  onSave,
  saveDebounceMs,
  isLoadingData = false,
  editable: editableProp = true,
  showMinimap = true,
  theme = "dark",
}, ref) {
  // Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<Canvas | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDrawingRef = useRef(false);
  const startPointRef = useRef<{ x: number; y: number } | null>(null);
  const currentShapeRef = useRef<FabricObject | null>(null);
  const suppressHistoryRef = useRef(false);
  const isRestoringRef = useRef(false);
  const clearHtmlSelectionRef = useRef<() => void>(() => {});
  // Read by stable callbacks so they stay no-ops in read-only mode without being recreated.
  const editableRef = useRef(editableProp);

  // Eraser refs
  const eraserTraceRef = useRef<Circle | null>(null);
  const eraserTargetsRef = useRef<Set<FabricObject>>(new Set());
  const eraserActiveRef = useRef(false);
  const eraserPathRef = useRef<fabric.Path | null>(null);
  const eraserPathPointsRef = useRef<string[]>([]);

  // Store
  const activeTool = useWhiteboardStore((state) => state.activeTool);
  const toolOptions = useWhiteboardStore((state) => state.toolOptions);
  const addCanvasObject = useWhiteboardStore((state) => state.addCanvasObject);
  const pushHistory = useWhiteboardStore((state) => state.pushHistory);
  const setEditable = useWhiteboardStore((state) => state.setEditable);
  const setActiveTool = useWhiteboardStore((state) => state.setActiveTool);
  const setTheme = useWhiteboardStore((state) => state.setTheme);

  // ── Theme ─────────────────────────────────────────────────────────────────────
  // Synced into the store so canvas-drawn UI (connector handles, welcome text)
  // and default tool colours follow it.
  const resolvedTheme = useResolvedTheme(theme);
  React.useEffect(() => { setTheme(resolvedTheme); }, [resolvedTheme, setTheme]);

  // Sync the editable prop into the shared store so every hook/component that
  // gates mutations reads a single source of truth. Forcing the tool back to
  // "select" also neutralizes the drawing/eraser handlers.
  React.useEffect(() => {
    editableRef.current = editableProp;
    setEditable(editableProp);
    if (!editableProp) setActiveTool("select");
  }, [editableProp, setEditable, setActiveTool]);

  // ── Nodes: controlled (`nodes` prop) or owned here ───────────────────────────
  const isControlled = nodesProp !== undefined;
  const [internalNodes, setInternalNodes] = useState<WhiteboardNode[]>([]);
  const nodes = isControlled ? nodesProp : internalNodes;

  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  // The overlay's live list (includes in-progress drag positions).
  const liveNodesRef = useRef<WhiteboardNode[]>(nodes);
  const isControlledRef = useRef(isControlled);
  isControlledRef.current = isControlled;
  const onNodesChangeRef = useRef(onNodesChange);
  onNodesChangeRef.current = onNodesChange;

  /** Single entry point for every node change: overlay gestures, ref API, Insert menu. */
  const commitNodes = useCallback((next: WhiteboardNode[]) => {
    nodesRef.current = next;
    liveNodesRef.current = next;
    if (!isControlledRef.current) setInternalNodes(next);
    onNodesChangeRef.current?.(next);
  }, []);

  // Nodes restored from initialData. Remembered so persistence doesn't treat them as an edit.
  const loadedNodesRef = useRef<WhiteboardNode[] | null>(null);

  const handleNodesLoaded = useCallback((loaded: WhiteboardNode[]) => {
    if (isControlledRef.current) return; // the consumer owns nodes in controlled mode
    loadedNodesRef.current = loaded;
    nodesRef.current = loaded;
    liveNodesRef.current = loaded;
    setInternalNodes(loaded);
  }, []);

  // State
  const [canvasReady, setCanvasReady] = useState(false);
  const [selectionBox, setSelectionBox] = useState<{
    x1: number; y1: number; x2: number; y2: number;
  } | null>(null);
  const [selectedCanvasObjects, setSelectedCanvasObjects] = useState<FabricObject[]>([]);
  const [canvasZoom, setCanvasZoom] = useState(1);

  // Track live zoom for the ZoomControls display. Only re-renders when the
  // zoom value changes, so panning doesn't cause extra renders.
  React.useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !canvasReady) return;

    let lastZoom = canvas.viewportTransform?.[0] ?? 1;

    const syncZoom = () => {
      const z = canvas.viewportTransform?.[0];
      if (z !== undefined && z !== lastZoom) {
        lastZoom = z;
        setCanvasZoom(z);
      }
    };

    canvas.on("after:render", syncZoom);
    syncZoom();
    return () => { canvas.off("after:render", syncZoom); };
  }, [canvasReady]);

  const MIN_ZOOM = 0.1;
  const MAX_ZOOM = 5;
  const ZOOM_STEP = 0.1;

  // Filled in by usePersistence below; read when hydration finishes.
  const cancelPendingSaveRef = useRef<() => void>(() => {});

  // Initialize canvas
  useCanvasInit({
    canvasRef,
    fabricCanvasRef,
    activeTool,
    suppressHistoryRef,
    isRestoringRef,
    pushHistory,
    onNodesLoaded: handleNodesLoaded,
    initialData,
    isLoadingData,
    hasExternalNodes: isControlled && nodes.length > 0,
    // Loading fires Fabric object events that queue a save; the load isn't an edit, so drop it.
    onReady: () => { cancelPendingSaveRef.current(); setCanvasReady(true); },
  });

  // Persistence
  const { cancelPendingSave } = usePersistence({
    fabricCanvas: fabricCanvasRef,
    nodes,
    pushHistory,
    isRestoringRef,
    suppressHistoryRef,
    onSave,
    saveDebounceMs,
    loadedNodesRef,
  });
  cancelPendingSaveRef.current = cancelPendingSave;

  // Tool management
  useToolManager({
    fabricCanvas: fabricCanvasRef,
    activeTool,
    toolOptions,
    eraserTraceRef,
    eraserPathRef,
    eraserPathPointsRef,
    eraserTargetsRef,
  });

  // Drawing handlers
  const drawingHandlers = useDrawing({
    fabricCanvas: fabricCanvasRef,
    activeTool,
    toolOptions,
    isDrawingRef,
    startPointRef,
    currentShapeRef,
    suppressHistoryRef,
    pushHistory,
    addCanvasObject,
  });

  // Copy-paste handlers
  useCopyPaste({ fabricCanvas: fabricCanvasRef });

  // Eraser handlers
  const eraserHandlers = useEraser({
    fabricCanvas: fabricCanvasRef,
    activeTool,
    toolOptions,
    eraserTraceRef,
    eraserTargetsRef,
    eraserActiveRef,
    eraserPathRef,
    eraserPathPointsRef,
    suppressHistoryRef,
    pushHistory,
  });

  // Zoom
  const { handleZoom } = useZoom({
    fabricCanvas: fabricCanvasRef,
    MIN_ZOOM,
    MAX_ZOOM,
    canvasZoom: 1,
    canvasViewport: { x: 0, y: 0 },
    setCanvasZoom: () => {},
    setCanvasViewport: () => {},
  });

  // Pan
  usePan({
    fabricCanvas: fabricCanvasRef,
    activeTool,
    handleZoom,
    setCanvasViewport: () => {},
  });

  // Connectors — registered before useSelection so connectors are stripped
  // from multi-selections before the selection is reported to the store.
  useConnectors({
    fabricCanvas: fabricCanvasRef,
    activeTool,
    suppressHistoryRef,
    isRestoringRef,
    pushHistory,
  });

  // Selection
  useSelection({
    fabricCanvas: fabricCanvasRef,
    activeTool,
    canvasZoom: 1,
    canvasViewport: { x: 0, y: 0 },
    setSelectionBox,
    setSelectedCanvasObjects,
    isDrawingRef,
    onClearHtmlSelection: clearHtmlSelectionRef.current,
  });

  // Text style updates
  useTextStyle({
    fabricCanvas: fabricCanvasRef,
    toolOptions,
  });

  // Live updates
  useLiveUpdate({
    fabricCanvas: fabricCanvasRef,
    toolOptions,
  });

  // Mouse handlers
  useMouseHandlers({
    fabricCanvas: fabricCanvasRef,
    activeTool,
    toolOptions,
    drawingHandlers,
    eraserHandlers,
  });

  // ── Node operations (shared by the ref API and the Insert menu) ──────────────
  const nodeTypesRef = useRef(nodeTypes);
  nodeTypesRef.current = nodeTypes;

  const addNode = useCallback(<T,>(input: AddNodeInput<T>): string => {
    const id = input.id ?? createObjectId();
    let { x, y } = input;
    if (x === undefined || y === undefined) {
      // Default: near the centre of the current view.
      const canvas = fabricCanvasRef.current;
      const vpt = canvas?.viewportTransform ?? [1, 0, 0, 1, 0, 0];
      const zoom = vpt[0] || 1;
      const w = canvas?.getWidth() ?? 0;
      const h = canvas?.getHeight() ?? 0;
      x ??= (w / 2 - vpt[4]) / zoom - 120;
      y ??= (h / 2 - vpt[5]) / zoom - 60;
    }
    let data: unknown = input.data;
    if (data === undefined) {
      const def = nodeTypesRef.current[input.type]?.defaultData;
      data = typeof def === "function" ? (def as () => T)() : def;
      // Shallow copy so nodes created from the same default don't share state.
      if (data && typeof data === "object" && !Array.isArray(data)) data = { ...(data as object) };
    }
    commitNodes([...liveNodesRef.current, { id, type: input.type, x, y, data: data ?? {} }]);
    return id;
  }, [commitNodes]);

  const updateNode = useCallback((id: string, patch: Partial<Omit<WhiteboardNode, "id">>) => {
    commitNodes(liveNodesRef.current.map((n) => (n.id === id ? { ...n, ...patch, id } : n)));
  }, [commitNodes]);

  const updateNodeData = useCallback((id: string, patch: any) => {
    commitNodes(liveNodesRef.current.map((n) => {
      if (n.id !== id) return n;
      const data = typeof patch === "function"
        ? patch(n.data)
        : n.data !== null && typeof n.data === "object" && !Array.isArray(n.data)
          ? { ...n.data, ...patch }
          : patch;
      return { ...n, data };
    }));
  }, [commitNodes]);

  const removeNode = useCallback((id: string) => {
    if (!liveNodesRef.current.some((n) => n.id === id)) return;
    commitNodes(liveNodesRef.current.filter((n) => n.id !== id));
  }, [commitNodes]);

  useImperativeHandle(ref, () => ({
    addNode,
    updateNode,
    updateNodeData,
    removeNode,
    getNodes: () => liveNodesRef.current,
    getSnapshot: () => {
      const canvas = fabricCanvasRef.current;
      return {
        canvas: canvas ? JSON.stringify(canvas.toJSON()) : "",
        nodes: liveNodesRef.current,
      };
    },
    getCanvas: () => fabricCanvasRef.current,
  }), [addNode, updateNode, updateNodeData, removeNode]);

  // ── Insert menu ───────────────────────────────────────────────────────────────
  const insertItems = useMemo(() => insertableTypes(nodeTypes), [nodeTypes]);
  const handleInsertNode = useCallback((type: string) => {
    if (!editableRef.current) return;
    addNode({ type });
  }, [addNode]);

  // ── Zoom handlers (read from canvas directly) ────────────────────────────────
  const handleZoomIn = useCallback(() => {
    const vpt = fabricCanvasRef.current?.viewportTransform;
    if (vpt) handleZoom(vpt[0] + ZOOM_STEP);
  }, [handleZoom]);

  const handleZoomOut = useCallback(() => {
    const vpt = fabricCanvasRef.current?.viewportTransform;
    if (vpt) handleZoom(vpt[0] - ZOOM_STEP);
  }, [handleZoom]);

  const handleResetZoom = useCallback(() => {
    handleZoom(1);
  }, [handleZoom]);

  return (
    <div className="easyflow-whiteboard w-full h-full" data-theme={resolvedTheme}>
      <div
        ref={containerRef}
        className="relative w-full h-full overflow-hidden bg-[var(--wb-bg)]"
        style={{ touchAction: "none", overscrollBehavior: "none" }}
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(circle, var(--wb-grid-dot) 1.2px, transparent 1.2px)`,
            backgroundSize: "40px 40px",
            zIndex: 0,
          }}
        />
        <canvas ref={canvasRef} className="absolute inset-0" style={{ zIndex: 1 }} />

        <MemoizedOverlayWrapper
          nodes={nodes}
          nodeTypes={nodeTypes}
          canvasReady={canvasReady}
          fabricCanvasRef={fabricCanvasRef}
          onNodesUpdate={commitNodes}
          liveNodesRef={liveNodesRef}
          selectionBox={selectionBox}
          selectedCanvasObjects={selectedCanvasObjects}
          clearHtmlSelectionRef={clearHtmlSelectionRef}
        />

        <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 100 }}>
          <div className="pointer-events-auto">
            <MemoizedToolbarWrapper
              canvasReady={canvasReady}
              fabricCanvasRef={fabricCanvasRef}
              isRestoringRef={isRestoringRef}
              insertItems={insertItems}
              onInsertNode={handleInsertNode}
            />
          </div>
          <div className="pointer-events-auto">
            <ToolOptionsPanel fabricCanvas={fabricCanvasRef} />
          </div>
          <div className="pointer-events-auto">
            <ZoomControls
              zoom={canvasZoom}
              onZoomIn={handleZoomIn}
              onZoomOut={handleZoomOut}
              onResetZoom={handleResetZoom}
            />
          </div>
          {showMinimap && canvasReady && (
            <div className="pointer-events-auto">
              <Minimap fabricCanvas={fabricCanvasRef} canvasReady={canvasReady} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

export default Whiteboard;
