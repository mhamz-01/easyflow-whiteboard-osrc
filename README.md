# easyflow-whiteboard

An embeddable React whiteboard built on Fabric.js and Zustand. You get an infinite canvas with drawing tools, connectors, a minimap, light and dark themes, and **your own React components as nodes on the board**.

---

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Custom HTML Nodes](#custom-html-nodes)
- [Component API](#component-api)
- [Ref API](#ref-api)
- [Types](#types)
- [Persistence](#persistence)
- [Controlled Nodes](#controlled-nodes)
- [Themes](#themes)
- [Store API](#store-api)
- [Available Tools](#available-tools)
- [Connectors](#connectors)
- [Minimap](#minimap)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Architecture Overview](#architecture-overview)
- [Built With](#built-with)

---

## Installation

```bash
npm install easyflow-whiteboard
```

### Peer Dependencies

```bash
npm install fabric@^7 react react-dom zustand@^5
```

React 18 and 19 are both supported. The only runtime dependency is `lucide-react`, for icons.

---

## Quick Start

```tsx
import { EasyflowWhiteboard } from 'easyflow-whiteboard';
import 'easyflow-whiteboard/dist/styles.css';

export default function Page() {
  return (
    <div style={{ width: '100%', height: '100vh' }}>
      <EasyflowWhiteboard />
    </div>
  );
}
```

> **Next.js note:** The component uses `"use client"` internally. If you use the App Router, render it from a Client Component.

---

## Custom HTML Nodes

Fabric draws the shapes, lines and text. Anything you want as real HTML (cards, notes, embeds, forms) is a **node**: you write a React component, register it under a type name, and the board handles positioning, dragging, selection, connectors, the minimap, saving and read-only mode.

```tsx
import {
  EasyflowWhiteboard,
  type NodeProps,
  type NodeTypes,
} from 'easyflow-whiteboard';

type StickyData = { text: string; color: string };

function StickyNote({ data, selected, editable, updateData }: NodeProps<StickyData>) {
  return (
    <div style={{ width: 220, padding: 12, borderRadius: 12, background: data.color }}>
      <textarea
        value={data.text}
        readOnly={!editable}
        onChange={(e) => updateData({ text: e.target.value })}
      />
    </div>
  );
}

// Define this OUTSIDE your component (or wrap it in useMemo).
const nodeTypes: NodeTypes = {
  sticky: {
    component: StickyNote,
    label: 'Sticky note',              // shows it in the toolbar's Insert menu
    icon: <StickyNoteIcon />,
    defaultData: { text: '', color: '#fde68a' },
    minimapColor: '#f59e0b',
  },
};

<EasyflowWhiteboard nodeTypes={nodeTypes} />;
```

### What your component receives

| Prop | Type | Description |
|------|------|-------------|
| `id` | `string` | The node id |
| `type` | `string` | The node type (key in `nodeTypes`) |
| `data` | `T` | Your data |
| `selected` | `boolean` | Part of the current selection. The board also draws an outline on your root element |
| `dragging` | `boolean` | Being dragged right now |
| `editable` | `boolean` | `false` when the board is read-only |
| `updateData` | `(patch \| (data) => data) => void` | Merge a patch into `data` (or pass an updater). Fires `onNodesChange` and `onSave`. No-op when read-only |
| `remove` | `() => void` | Remove this node and its connectors. No-op when read-only |

### Dragging and interaction

- With the **Select** tool, the whole node is draggable by default.
- Pointer-downs on `input`, `textarea`, `select`, `button`, links and `contenteditable` never start a drag, so form controls just work.
- Add `className="nodrag"` to any other element that should stay interactive.
- Set `dragHandle: '.my-header'` on the type to drag only from that element.
- Board shortcuts (tool letters, Delete, Ctrl+A…) are ignored while the user types inside a node.
- Size is up to your component. The board measures it for connectors, rubber-band selection and the minimap, and follows it when it changes.

### Node type options

| Field | Type | Description |
|------|------|-------------|
| `component` | `ComponentType<NodeProps<T>>` | **Required.** Renders the node |
| `label` | `string` | Lists the type in the toolbar's Insert menu. Types without a label can still be added from code |
| `icon` | `ReactNode` | Icon in the Insert menu |
| `description` | `string` | Second line in the Insert menu |
| `defaultData` | `T \| () => T` | Data for nodes created from the menu or by `addNode` without `data` |
| `dragHandle` | `string` | CSS selector that limits dragging to that element |
| `minimapColor` | `string` | Colour on the minimap (default blue) |

A saved node whose type isn't registered renders a small "Unknown node type" placeholder instead of crashing.

---

## Component API

### `<EasyflowWhiteboard />`

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `nodeTypes` | `NodeTypes` | `{}` | Your node components, keyed by type |
| `initialData` | `WhiteboardInitialData` | — | Saved board to restore (`canvas` + `nodes`) |
| `onSave` | `(payload: WhiteboardSavePayload) => void` | — | Debounced callback after any change |
| `saveDebounceMs` | `number` | `2000` | Debounce delay for `onSave` |
| `nodes` | `WhiteboardNode[]` | — | Controlled nodes. See [Controlled Nodes](#controlled-nodes) |
| `onNodesChange` | `(nodes: WhiteboardNode[]) => void` | — | Called after every node add, move, edit or delete |
| `isLoadingData` | `boolean` | `false` | Shows a toolbar skeleton and waits before loading `initialData`, so data fetched after mount still loads |
| `editable` | `boolean` | `true` | `false` makes the board read-only. See [EDITABLE_MODE.md](./EDITABLE_MODE.md) |
| `showMinimap` | `boolean` | `true` | Show the minimap (hidden on small screens) |
| `theme` | `"dark" \| "light" \| "system"` | `"dark"` | Colour theme. See [Themes](#themes) |
| `ref` | `Ref<WhiteboardHandle>` | — | Imperative API. See [Ref API](#ref-api) |

---

## Ref API

Add nodes from your own UI (a sidebar, a drop handler, a keyboard shortcut) through a ref:

```tsx
import { useRef } from 'react';
import { EasyflowWhiteboard, type WhiteboardHandle } from 'easyflow-whiteboard';

function Board() {
  const board = useRef<WhiteboardHandle>(null);

  return (
    <>
      <button onClick={() => board.current?.addNode({ type: 'sticky', data: { text: 'Hi', color: '#bbf7d0' } })}>
        Add note
      </button>
      <EasyflowWhiteboard ref={board} nodeTypes={nodeTypes} />
    </>
  );
}
```

| Method | Description |
|------|------|
| `addNode({ type, data?, x?, y?, id? })` | Adds a node and returns its id. Without `x`/`y` it goes in the centre of the view; without `data` it uses the type's `defaultData` |
| `updateNode(id, patch)` | Change `x`, `y`, `type` or `data` |
| `updateNodeData(id, patch \| updater)` | Merge into `data` |
| `removeNode(id)` | Remove a node and its connectors |
| `getNodes()` | Current nodes, including positions mid-drag |
| `getSnapshot()` | `{ canvas, nodes }`, the same shape `onSave` receives, built now |
| `getCanvas()` | The underlying Fabric `Canvas`, for advanced use |

---

## Types

```ts
interface WhiteboardNode<T = any> {
  id:   string;
  type: string;   // key in nodeTypes
  x:    number;   // world-space position of the top-left corner
  y:    number;
  data: T;        // yours; the board stores it but never reads it
}

interface WhiteboardInitialData {
  canvas?: string;            // `canvas` from a previous onSave
  nodes?:  WhiteboardNode[];  // `nodes` from a previous onSave
}

interface WhiteboardSavePayload {
  canvas: string;             // serialized Fabric canvas
  nodes:  WhiteboardNode[];
}
```

Also exported: `NodeProps<T>`, `NodeTypeDefinition<T>`, `NodeTypes`, `AddNodeInput<T>`, `WhiteboardHandle`, `WhiteboardProps`, `WhiteboardTheme`.

---

## Persistence

The board owns the UI. You own the storage:

```tsx
import { EasyflowWhiteboard, type WhiteboardInitialData, type WhiteboardSavePayload } from 'easyflow-whiteboard';
import 'easyflow-whiteboard/dist/styles.css';
import { useCallback, useEffect, useState } from 'react';

export default function BoardPage({ boardId }: { boardId: string }) {
  const [initialData, setInitialData] = useState<WhiteboardInitialData>();
  const [isLoading, setIsLoading] = useState(true);

  // 1. Load the saved board
  useEffect(() => {
    fetch(`/api/boards/${boardId}`)
      .then((r) => r.json())
      .then((data) => {
        setInitialData({ canvas: data.canvas, nodes: data.nodes });
        setIsLoading(false);
      });
  }, [boardId]);

  // 2. Save on every debounced change
  const handleSave = useCallback(async (payload: WhiteboardSavePayload) => {
    await fetch(`/api/boards/${boardId}`, { method: 'PUT', body: JSON.stringify(payload) });
  }, [boardId]);

  return (
    <div style={{ width: '100%', height: '100vh' }}>
      <EasyflowWhiteboard
        nodeTypes={nodeTypes}
        initialData={initialData}
        isLoadingData={isLoading}
        onSave={handleSave}
      />
    </div>
  );
}
```

- `onSave` doesn't fire just because a board loaded. It fires only after a real change.
- Keep node ids stable across saves: connectors attached to a node reference it by `id`.

---

## Controlled Nodes

By default the board owns its nodes (seeded from `initialData.nodes`). If you'd rather keep nodes in your own state, for example to sync them with a server or share them with other UI, pass `nodes` and `onNodesChange`. This works like `value` and `onChange` on an input:

```tsx
const [nodes, setNodes] = useState<WhiteboardNode[]>(savedNodes);

<EasyflowWhiteboard
  nodeTypes={nodeTypes}
  nodes={nodes}
  onNodesChange={setNodes}
  initialData={{ canvas: savedCanvas }}  // nodes come from the prop, not initialData
/>;
```

- Drags update the screen every frame but call `onNodesChange` once, when the drag ends.
- The Insert menu, the ref API, `updateData` and Delete all go through `onNodesChange`.
- `onNodesChange` also fires in uncontrolled mode, if you only want to listen.

---

## Themes

```tsx
<EasyflowWhiteboard theme="light" />    // "dark" (default) | "light" | "system"
```

- `"system"` follows the OS setting and updates live when it changes.
- The theme can change at any time without remounting.
- New drawings use the theme's default ink: white on dark, near-black on light. Switching themes moves the default pen, shape, line, arrow and text colours along, unless the user picked a colour themselves. Shapes already on the board keep their colours.
- Your node components are your own. Use the `data-theme="light" | "dark"` attribute on the `.easyflow-whiteboard` root to style them.

---

## Store API

Read or drive the editor state from anywhere in your app:

```tsx
import { useWhiteboardStore } from 'easyflow-whiteboard';

function PenButton() {
  const setActiveTool = useWhiteboardStore((s) => s.setActiveTool);
  return <button onClick={() => setActiveTool('pen')}>Pen</button>;
}
```

| Field | Type | Description |
|-------|------|-------------|
| `activeTool` / `setActiveTool` | `Tool` | Current drawing tool |
| `toolOptions` / `setToolOption` | `ToolOptions` | Per-tool styling (colour, width, dash…) |
| `canUndo` / `canRedo` | `boolean` | Undo/redo availability |
| `zoom` | `number` | Zoom level (1 = 100%) |
| `editable` | `boolean` | Read-only state (driven by the `editable` prop) |
| `theme` | `"dark" \| "light"` | Resolved theme (driven by the `theme` prop) |
| `bringToFront` / `sendToBack` | `(canvas) => void` | Layer order for the selected object |

---

## Available Tools

| Tool ID | Shortcut | Description |
|---------|----------|-------------|
| `select` | `V` | Select and move objects and nodes |
| `pan` | `H` | Drag to pan; two-finger pinch to zoom |
| `pen` | `P` | Freehand drawing |
| `rectangle` | `R` | Rectangles |
| `circle` | `C` | Circles |
| `frame` | `F` | White frames, always behind other objects |
| `line` | `L` | Straight lines |
| `arrow` | `A` | Lines with an arrowhead |
| `connector` | `X` | Lines attached to shapes and nodes. See [Connectors](#connectors) |
| `text` | `T` | Editable text |
| `image` | `I` | Upload an image |
| `eraser` | `E` | Brush-erase objects |
| `undo` / `redo` | `Ctrl+Z` / `Ctrl+Shift+Z` | History |

---

## Connectors

Connectors stay attached to shapes **and nodes**. When either end moves, resizes or changes size, the connector re-routes.

- **Hover any shape or node** (Select tool) to show four anchor dots. **Drag from a dot** onto another shape or node.
- Release on a target's body for a smart anchor that picks the facing side. Release on an edge dot to pin that side.
- Release on empty canvas to leave a free end.
- **Connector tool (`X`)**: drag from anywhere.
- Select a connector and drag an endpoint to re-attach it. `Esc` cancels.
- Style it in the properties panel: Elbow / Curved / Straight, arrowheads, dash, colour, width.
- Deleting a shape or node deletes its connectors.

Details: [CONNECTORS.md](./CONNECTORS.md).

---

## Minimap

A scaled overview in the bottom-right corner shows every shape, connector and node, plus the visible area.

- **Click** to jump, **drag** the viewport box to pan, **Ctrl/⌘ + scroll** to zoom.
- **Fit** (⤢) brings everything into view. **Hide** (–) collapses it.
- Nodes use their type's `minimapColor`.

Turn it off with `showMinimap={false}`.

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `V H P R C F L A X T I E` | Switch tool |
| `Delete` / `Backspace` | Delete the selected objects or nodes |
| `Ctrl+Z` / `Ctrl+Shift+Z` / `Ctrl+Y` | Undo / redo |
| `Ctrl+C` / `Ctrl+V` | Copy / paste canvas objects |
| `Ctrl+A` | Select all nodes |
| `Escape` | Clear node selection |
| `Ctrl++` / `Ctrl+-` / `Ctrl+0` | Zoom in / out / reset |
| `Ctrl+Scroll` | Zoom to cursor |
| `Shift+Scroll` | Horizontal pan |

Shortcuts are ignored while typing in inputs, textareas or contenteditable elements, including ones inside your nodes.

---

## Architecture Overview

The full architecture is in [ARCHITECTURE.md](./ARCHITECTURE.md).

```
EasyflowWhiteboard (components/whiteboard/whiteboard.tsx)
│
├── <canvas>              Fabric.js: shapes, paths, images, arrows, frames, text, connectors
├── CanvasOverlayLayer    HTML layer with the same viewport transform; renders your nodes
├── WhiteboardToolbar     Bottom bar: tools, undo/redo, Insert menu
├── ToolOptionsPanel      Left properties panel
├── ZoomControls          Top-right zoom pill
└── Minimap               Bottom-right overview
```

The HTML layer is transformed with the canvas's `viewportTransform`, so a node at `(x: 100, y: 200)` sits exactly over canvas point `(100, 200)` at any zoom or pan.

---

## Built With

| Dependency | Role |
|-----------|------|
| [Fabric.js v7](https://fabricjs.com/) | Canvas engine (peer) |
| [Zustand v5](https://zustand-demo.pmnd.rs/) | State (peer) |
| [Lucide React](https://lucide.dev/) | Icons |
| [TailwindCSS v4](https://tailwindcss.com/) | Styling, compiled to `dist/styles.css` at build time |

---

## License

MIT © Muhammad Hamza
#   e a s y f l o w - w h i t e b o a r d - o s r c  
 