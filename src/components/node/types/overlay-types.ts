// Internal TypeScript interfaces for the HTML canvas overlay: drag state and the overlay's prop contract.

import type { RefObject, MutableRefObject } from "react";
import type { FabricObject, Canvas } from "fabric";
import type { NodeTypes, WhiteboardNode } from "../../../types/canvas-node";

export interface CanvasOverlayLayerProps {
  nodes: WhiteboardNode[];
  nodeTypes: NodeTypes;
  /** Called with the full node list whenever the overlay commits a change. */
  onNodesUpdate?: (nodes: WhiteboardNode[]) => void;
  /** Overlay publishes its live node list here so the root's ref API reads drag-time positions. */
  liveNodesRef?: MutableRefObject<WhiteboardNode[]>;
  canvasZoom?: number;
  canvasViewport?: { x: number; y: number };
  selectionBox?: { x1: number; y1: number; x2: number; y2: number } | null;
  selectedCanvasObjects?: FabricObject[];
  fabricCanvas?: RefObject<Canvas | null>;
  canvasReady?: boolean;
  clearHtmlSelectionRef?: MutableRefObject<() => void>;
}

export interface DragState {
  isDragging: boolean;
  moved: boolean;
  itemIds: string[];
  startPositions: Map<string, { x: number; y: number }>;
  canvasObjectsStartPos: Map<FabricObject, { left: number; top: number }>;
  offsetX: number;
  offsetY: number;
}

export interface PointerCoords {
  clientX: number;
  clientY: number;
}
