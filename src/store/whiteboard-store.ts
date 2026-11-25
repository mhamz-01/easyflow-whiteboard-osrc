// Global Zustand store — owns all canvas state: active tool, tool options, selection, undo/redo history, and zoom.

import { create } from "zustand";
import { Canvas, FabricObject } from "fabric";
import type { ConnectorLineType } from "../lib/fabric-connector";
import { CONNECTOR_DEFAULT_COLOR, INK, type ResolvedTheme } from "../lib/design-tokens";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Tool =
  | "select"
  | "pan"
  | "pen"
  | "rectangle"
  | "circle"
  | "line"
  | "arrow"
  | "frame"
  | "text"
  | "image"
  | "eraser"
  | "connector"
  | "undo"
  | "redo";

export interface ToolOptions {
  pen: {
    color: string;
    strokeWidth: number;
    opacity: number;
    strokeDashArray: number[] | null;
  };
  rectangle: {
    fillColor: string;
    strokeColor: string;
    strokeWidth: number;
    strokeDashArray: number[] | null;
  };
  circle: {
    fillColor: string;
    strokeColor: string;
    strokeWidth: number;
    strokeDashArray: number[] | null;
  };
  frame: {
    fillColor: string;
    strokeColor: string;
    strokeWidth: number;
    strokeDashArray: number[] | null;
  };
  text: {
    fontSize: number;
    fontFamily: string;
    fontWeight: string;
    textAlign: string;
    color: string;
  };
  image: {
    opacity: number;
    filters: string[];
  };
  eraser: {
    size: number;
  };
  line: {
    strokeColor: string;
    strokeWidth: number;
    strokeDashArray: number[] | null;
  };
  arrow: {
    strokeColor: string;
    strokeWidth: number;
    strokeDashArray: number[] | null;
  };
  connector: {
    strokeColor: string;
    strokeWidth: number;
    strokeDashArray: number[] | null;
    lineType: ConnectorLineType;
    startArrow: boolean;
    endArrow: boolean;
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Each history entry is a full JSON canvas snapshot (can be 100KB+).
// Without a cap: 200 actions × 100KB = 20MB of undo history in memory.
const MAX_HISTORY = 50;

const defaultToolOptions: ToolOptions = {
  pen:       { color: "#ffffff", strokeWidth: 2, opacity: 1, strokeDashArray: null },
  rectangle: { fillColor: "transparent", strokeColor: "#ffffff", strokeWidth: 2, strokeDashArray: null },
  circle:    { fillColor: "transparent", strokeColor: "#ffffff", strokeWidth: 2, strokeDashArray: null },
  frame:     { fillColor: "#FFFFFF", strokeColor: "#E5E7EB", strokeWidth: 1, strokeDashArray: null },
  text:      { fontSize: 24, fontFamily: "cursive", color: "#ffffff", fontWeight: "400", textAlign: "left" },
  image:     { opacity: 1, filters: [] },
  eraser:    { size: 20 },
  line:      { strokeColor: "#ffffff", strokeWidth: 2, strokeDashArray: null },
  arrow:     { strokeColor: "#ffffff", strokeWidth: 2, strokeDashArray: null },
  connector: { strokeColor: CONNECTOR_DEFAULT_COLOR, strokeWidth: 2, strokeDashArray: null, lineType: "elbow", startArrow: false, endArrow: true },
};

// ─── State interface ──────────────────────────────────────────────────────────

interface WhiteboardState {
  editable: boolean;
  setEditable: (editable: boolean) => void;

  activeTool: Tool;
  setActiveTool: (tool: Tool) => void;

  /** Resolved colour theme. Canvas-drawn UI (connectors, minimap, eraser) reads it. */
  theme: ResolvedTheme;
  /** Switch theme; tool colours still on the old theme's default ink follow along. */
  setTheme: (theme: ResolvedTheme) => void;

  selectedObjectType: string | null;
  setSelectedObjectType: (type: string | null) => void;

  canvasObjects: FabricObject[];
  addCanvasObject:    (obj: FabricObject) => void;
  removeCanvasObject: (obj: FabricObject) => void;
  clearCanvasObjects: () => void;

  bringToFront: (canvas: Canvas) => void;
  sendToBack: (canvas: Canvas) => void;
  bringForward: (canvas: Canvas) => void;
  sendBackward: (canvas: Canvas) => void;

  selectedObjects: FabricObject[];
  setSelectedObjects: (objects: FabricObject[]) => void;

  toolOptions: ToolOptions;
  setToolOption: <T extends keyof ToolOptions>(
    tool: T,
    option: keyof ToolOptions[T],
    value: any
  ) => void;

  history: string[];
  historyIndex: number;
  canUndo: boolean;
  canRedo: boolean;
  pushHistory: (snapshot: string) => void;
  replaceCurrentHistory: (snapshot: string) => void;
  undo: () => string | null;
  redo: () => string | null;
  setCanUndo: (v: boolean) => void;
  setCanRedo: (v: boolean) => void;

  zoom: number;
  setZoom: (zoom: number) => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useWhiteboardStore = create<WhiteboardState>()((set, get) => ({

  // ── Editable (read-only mode) ────────────────────────────────────────────
  editable: true,
  setEditable: (editable) => set({ editable }),

  // ── Tool ──────────────────────────────────────────────────────────────────
  activeTool: "select",
  setActiveTool: (tool) => set({ activeTool: tool }),

  // ── Theme ─────────────────────────────────────────────────────────────────
  // Default stroke/text colours are the theme's "ink" (white on dark, near-black
  // on light). When the theme flips, any tool colour still equal to the old ink
  // moves to the new one, so new drawings stay visible. Colours the user picked
  // are left alone, and existing canvas objects are never changed.
  theme: "dark",
  setTheme: (theme) => set((s) => {
    if (s.theme === theme) return {};
    const from = INK[s.theme].toLowerCase();
    const to = INK[theme];
    const swap = (c: string) => (c.toLowerCase() === from ? to : c);
    const o = s.toolOptions;
    return {
      theme,
      toolOptions: {
        ...o,
        pen:       { ...o.pen,       color:       swap(o.pen.color) },
        rectangle: { ...o.rectangle, strokeColor: swap(o.rectangle.strokeColor) },
        circle:    { ...o.circle,    strokeColor: swap(o.circle.strokeColor) },
        text:      { ...o.text,      color:       swap(o.text.color) },
        line:      { ...o.line,      strokeColor: swap(o.line.strokeColor) },
        arrow:     { ...o.arrow,     strokeColor: swap(o.arrow.strokeColor) },
      },
    };
  }),

  // ── Selected object type ──────────────────────────────────────────────────
  selectedObjectType: null,
  setSelectedObjectType: (type) => set({ selectedObjectType: type }),

  // ── Canvas objects ────────────────────────────────────────────────────────
  // NOTE: Fabric instances have circular refs and DOM refs — they cannot be
  // serialized. If you add devtools back, exclude this slice or it will throw.
  // Using concat() instead of spread avoids the intermediate spread allocation.
  canvasObjects: [],
  addCanvasObject:    (obj) => set((s) => ({ canvasObjects: s.canvasObjects.concat(obj) })),
  removeCanvasObject: (obj) => set((s) => ({ canvasObjects: s.canvasObjects.filter((o) => o !== obj) })),
  clearCanvasObjects: ()    => set({ canvasObjects: [] }),

  // ── Selected objects ──────────────────────────────────────────────────────
  selectedObjects: [],
  setSelectedObjects: (objects) => set({ selectedObjects: objects }),

  // ── Tool options ──────────────────────────────────────────────────────────
  toolOptions: defaultToolOptions,
  setToolOption: (tool, option, value) =>
    set((s) => ({
      toolOptions: {
        ...s.toolOptions,
        [tool]: { ...s.toolOptions[tool], [option]: value },
      },
    })),

  // ── History ───────────────────────────────────────────────────────────────
  history: [],
  historyIndex: -1,
  canUndo: false,
  canRedo: false,

  // Uses set() updater (single atomic write) instead of get() + set() which
  // could interleave in React concurrent mode.
  // An identical snapshot is ignored: autosave re-snapshots after undo/redo
  // restores and after tools that already pushed, and recording those would
  // wipe the redo stack and make the next undo a no-op.
  pushHistory: (snapshot) =>
    set((s) => {
      if (s.history[s.historyIndex] === snapshot) return s;
      const trimmed  = s.history.slice(0, s.historyIndex + 1);
      trimmed.push(snapshot);
      const capped   = trimmed.length > MAX_HISTORY ? trimmed.slice(-MAX_HISTORY) : trimmed;
      const newIndex = capped.length - 1;
      return { history: capped, historyIndex: newIndex, canUndo: newIndex > 0, canRedo: false };
    }),

  // After undo/redo, the restored canvas re-serializes slightly differently
  // (e.g. `strokeDashArray: null` vs omitted). Storing that form keeps the
  // autosave that follows a restore from counting as a new change.
  replaceCurrentHistory: (snapshot) =>
    set((s) => {
      if (s.historyIndex < 0) return s;
      const history = s.history.slice();
      history[s.historyIndex] = snapshot;
      return { history };
    }),

  undo: () => {
    const { history, historyIndex } = get();
    if (historyIndex > 0) {
      const i = historyIndex - 1;
      set({ historyIndex: i, canUndo: i > 0, canRedo: true });
      return history[i];
    }
    return null;
  },

  redo: () => {
    const { history, historyIndex } = get();
    if (historyIndex < history.length - 1) {
      const i = historyIndex + 1;
      set({ historyIndex: i, canUndo: true, canRedo: i < history.length - 1 });
      return history[i];
    }
    return null;
  },

  setCanUndo: (v) => set({ canUndo: v }),
  setCanRedo: (v) => set({ canRedo: v }),

  // ── Zoom ──────────────────────────────────────────────────────────────────
  zoom: 1,
  setZoom: (zoom) => set({ zoom }),


   // ── Layer ordering ─────────────────────────────────────────────────────
   bringToFront: (canvas) => {
    const active = canvas.getActiveObject();
    if (active) {
      canvas.bringObjectToFront(active);
      canvas.requestRenderAll();
    }
  },

  sendToBack: (canvas) => {
    const active = canvas.getActiveObject();
    if (active) {
      canvas.sendObjectToBack(active);
      canvas.requestRenderAll();
    }
  },

  bringForward: (canvas) => {
    const active = canvas.getActiveObject();
    if (active) {
      canvas.bringObjectForward(active);
      canvas.requestRenderAll();
    }
  },

  sendBackward: (canvas) => {
    const active = canvas.getActiveObject();
    if (active) {
      canvas.sendObjectBackwards(active);
      canvas.requestRenderAll();
    }
  },
}));