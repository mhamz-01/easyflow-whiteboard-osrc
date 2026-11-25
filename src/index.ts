// Public API barrel — the component, the store, and the types consumers need.

// Component
export { default as EasyflowWhiteboard } from "./components/whiteboard/whiteboard";
export type { WhiteboardProps, WhiteboardTheme } from "./components/whiteboard/whiteboard";

// Store
export { useWhiteboardStore } from "./store/whiteboard-store";

// Persistence
export type { WhiteboardInitialData, WhiteboardSavePayload } from "./components/whiteboard/whiteboard";

// Custom HTML nodes
export type {
  WhiteboardNode,
  NodeProps,
  NodeTypeDefinition,
  NodeTypes,
  AddNodeInput,
  WhiteboardHandle,
} from "./types/canvas-node";
