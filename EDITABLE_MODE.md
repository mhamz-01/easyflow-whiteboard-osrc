# Read-only mode (`editable`)

`<EasyflowWhiteboard />` accepts an `editable` prop that puts the whole canvas
into a read-only state — the same on/off switch pattern as
`@mhamz.01/easyflow-texteditor`'s `editable` prop.

```tsx
<EasyflowWhiteboard editable={access !== "view"} />
```

| Prop | Type | Default |
|------|------|---------|
| `editable` | `boolean` | `true` |

## What `editable={false}` does

- Existing canvas objects can't be selected, moved, resized, rotated, or deleted.
- Drawing tools (pen, shapes, text, image, eraser) never enter drawing mode —
  clicking them in the toolbar is a no-op, and the tool buttons render disabled.
- `Delete`/`Backspace` does nothing, for both Fabric objects and HTML nodes.
- `Ctrl/Cmd+V` paste is a no-op (copy still works — it doesn't mutate anything).
- Dragging nodes is disabled, the toolbar's Insert menu is hidden, and the
  `updateData` / `remove` props your node components receive become no-ops.
  Components also get `editable={false}` so they can render a read-only view.
- `onSave` simply never fires, since nothing can mutate the canvas.

Read-only affordances stay active: panning, zooming, and selecting a tool to
view it are unaffected.

## Runtime toggling

`editable` can be flipped on an already-mounted instance — no remount, no
lost canvas state. The change takes effect on the next render via the shared
Zustand store (`useWhiteboardStore`), the same store every canvas hook reads
from to decide whether it's allowed to mutate.

## Non-goals

- No per-object or per-user permissions — this is a single whole-canvas switch.
- The read-only state is not persisted into the saved canvas JSON; it's purely
  a client-side rendering mode driven by the prop.
