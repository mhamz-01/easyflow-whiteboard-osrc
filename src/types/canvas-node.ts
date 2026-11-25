// Public node types: how consumers describe their own HTML nodes and the props each node component receives.

import type { ComponentType, ReactNode } from "react";
import type { Canvas } from "fabric";

/**
 * One HTML node placed on the board.
 *
 * `x`/`y` are world (canvas) coordinates of the node's top-left corner.
 * `data` is yours: the whiteboard stores and saves it but never reads it.
 */
export interface WhiteboardNode<T = any> {
  id: string;
  /** Key into the `nodeTypes` prop. */
  type: string;
  x: number;
  y: number;
  data: T;
}

/** Props the whiteboard passes to every node component. */
export interface NodeProps<T = any> {
  id: string;
  type: string;
  data: T;
  /** The node is part of the current selection. */
  selected: boolean;
  /** The node is being dragged right now. */
  dragging: boolean;
  /** False when the board is read-only (`editable={false}`). */
  editable: boolean;
  /** Merge a patch into `data` (or pass an updater). Triggers `onNodesChange` and `onSave`. */
  updateData: (patch: Partial<T> | ((data: T) => T)) => void;
  /** Remove this node (and its connectors) from the board. */
  remove: () => void;
}

/** How one node type is rendered and offered in the toolbar. */
export interface NodeTypeDefinition<T = any> {
  /** The React component that renders the node. */
  component: ComponentType<NodeProps<T>>;
  /** When set, the type is listed in the toolbar's Insert menu under this name. */
  label?: string;
  /** Icon shown next to `label` in the Insert menu. */
  icon?: ReactNode;
  /** Secondary line shown under `label` in the Insert menu. */
  description?: string;
  /** Data for nodes created from the Insert menu, or by `addNode` without `data`. */
  defaultData?: T | (() => T);
  /**
   * CSS selector inside the node that starts a drag (e.g. ".my-header").
   * Without it, the whole node is draggable except elements matching `.nodrag`
   * and native interactive elements (inputs, buttons, links…).
   */
  dragHandle?: string;
  /** Colour of the node on the minimap. */
  minimapColor?: string;
}

export type NodeTypes = Record<string, NodeTypeDefinition<any>>;

/** Argument of `addNode`. Missing `x`/`y` places the node in the centre of the view. */
export interface AddNodeInput<T = any> {
  type: string;
  data?: T;
  x?: number;
  y?: number;
  id?: string;
}

/** Imperative API exposed through the component's `ref`. */
export interface WhiteboardHandle {
  /** Add a node and return its id. */
  addNode: <T = any>(node: AddNodeInput<T>) => string;
  /** Change a node's fields (position, type, data). */
  updateNode: <T = any>(id: string, patch: Partial<Omit<WhiteboardNode<T>, "id">>) => void;
  /** Merge a patch into a node's `data`, or pass an updater. */
  updateNodeData: <T = any>(id: string, patch: Partial<T> | ((data: T) => T)) => void;
  /** Remove a node and its connectors. */
  removeNode: (id: string) => void;
  /** Current nodes, including positions from an in-progress drag. */
  getNodes: () => WhiteboardNode[];
  /** Same payload `onSave` receives, built right now. */
  getSnapshot: () => { canvas: string; nodes: WhiteboardNode[] };
  /** The underlying Fabric canvas, for advanced use. */
  getCanvas: () => Canvas | null;
}
