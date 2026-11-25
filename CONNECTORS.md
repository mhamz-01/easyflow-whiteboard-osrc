# Connectors

Connectors are lines that stay attached to what they connect. They can link any
canvas shape (rectangle, circle, frame, text, image, freehand path) and the HTML
**custom HTML nodes** (any component registered in `nodeTypes`). When either end moves, resizes, rotates or expands,
the connector re-routes to follow it.

- [Using connectors](#using-connectors)
- [Appearance and the design system](#appearance-and-the-design-system)
- [Saved data](#saved-data)
- [How it is implemented](#how-it-is-implemented)
  - [File map](#file-map)
  - [Data model](#data-model)
  - [Connect targets: shapes and nodes](#connect-targets-shapes-and-nodes)
  - [Routing](#routing)
  - [Rendering: the connector layer](#rendering-the-connector-layer)
  - [Hit testing](#hit-testing)
  - [Interaction: the gesture state machine](#interaction-the-gesture-state-machine)
  - [Staying attached](#staying-attached)
  - [Ids, persistence, undo and copy/paste](#ids-persistence-undo-and-copypaste)
- [Limitations and extension points](#limitations-and-extension-points)

---

## Using connectors

| Action | Result |
|---|---|
| Hover a shape or node (Select tool) | Four blue anchor dots appear just outside its edges |
| Drag from a dot, release on another shape or node | Connected. The target is outlined while you hover it |
| Release on a target's body | The end uses a **smart anchor** that always picks the side facing the other end |
| Release on one of the target's edge dots | The end is **pinned** to that side |
| Release on empty canvas | The end stays free at that point |
| Click a dot without dragging (rectangle, circle, frame) | Adds a connected copy of the shape in that direction |
| Connector tool (`X`), then drag | Start from anywhere: a shape, a node body, or empty canvas |
| Select a connector, drag an end handle | Re-attach that end. `Esc` cancels |
| `Delete` on a selected connector | Removes it |
| Delete a shape or node | Its connectors are removed too |
| Properties panel (connector selected) | Route (Elbow / Curved / Straight), start/end arrowheads, dash, color, width |

New connectors use the last style picked in the panel, so you can style one and
keep drawing in that style.

In read-only mode (`editable={false}`) no anchors are shown and connectors can't
be created or re-attached.

On touch devices a shape's anchor dots are shown while it is selected, and you
drag from them with a finger. Fabric's resize and rotate handles take priority
where they overlap. Nodes don't show anchor dots on touch (there is no hover),
but you can still drop onto them, and start from one with the Connector tool.

## Appearance and the design system

Connectors follow the EasyFlow design system (dark theme, zinc neutrals, vivid
brand accents). The values live in `src/lib/design-tokens.ts`, because
canvas-drawn UI can't read CSS variables. Change them there and the connector,
its handles, the properties panel and the minimap all follow.

| Element | Design |
|---|---|
| Default line colour | Muted foreground `#A6A6A9`. Lines stay quieter than the shapes and nodes they join, so coloured connectors stand out |
| Palette | Muted, White `#FBFBFB`, Gray `#6E6E6E`, Primary Blue `#0D8EFF`, Green `#51FF00`, Yellow `#FFC53D`, Pink `#FF00C8`, Red `#F26D5B` |
| Elbow corners | Rounded at 10px, the base `--radius` |
| Arrowheads | Filled, then stroked in the same colour with round joins, so the corners are softly rounded. The tip is pulled back by half that stroke so the visible point lands exactly on the target's edge |
| Dash styles | Solid; Dashed (4 : 3 × width); Dotted (round caps on a near-zero dash, which gives true dots) |
| Hover | Pointer over a connector: light Primary Blue glow (18%), so it's clear what a click selects |
| Selected | Stronger Primary Blue glow (32%), plus endpoint handles: filled blue = attached, dark with a blue ring = free |
| Anchor dots | Dark surface `#191919` with a 2px Primary Blue ring. The active one turns solid blue with a white rim and a soft halo |
| Drop target | 2px Primary Blue outline with a soft glow, shaped like the target: rounded rectangle for nodes (16px radius), ellipse for circles, the object's outline otherwise |
| Properties panel | Live preview of the exact style, segmented controls with a Primary Blue active state, 10px radii, translucent-white borders (`white/10`), muted `#A6A6A9` labels, and a blue-accented width slider |

Typography in the panel inherits the host app's font. In EasyFlow that's
Red Hat Display, applied globally, so the library doesn't bundle a font.

## Saved data

Connectors are ordinary objects in the canvas JSON:

```jsonc
{
  "type": "connector",
  "lineType": "elbow",          // "elbow" | "curved" | "straight"
  "startArrow": false,
  "endArrow": true,
  "stroke": "#ffffff",
  "strokeWidth": 2,
  "strokeDashArray": null,
  "source": { "id": "3f1c…", "anchor": "right", "x": 461, "y": 200 },
  "target": { "id": "note-1", "anchor": "auto",  "x": 520, "y": 219 }
}
```

- `id` is either a canvas object's `id` or a node `id` from your `nodes`
  data. **Keep node ids stable across saves.**
- `anchor` is `"top" | "right" | "bottom" | "left"` (pinned), `"auto"` (smart),
  or `null` (free end).
- `x`/`y` is the last resolved position. If an `id` can't be found (a node that
  hasn't loaded yet, or one your backend removed), the end stays at `x`/`y`
  instead of disappearing.
- Every canvas object now also saves an `id`. Older boards without ids get
  them assigned on load.

---

## How it is implemented

### File map

| File | Responsibility |
|---|---|
| `src/lib/fabric-connector.ts` | The `Connector` Fabric class (routing, painting, hit testing, JSON), anchor geometry, connect targets, node registry, helpers (`refreshConnectors`, `reassignIds`, `removeConnectorsFor`) |
| `src/hooks/useConnectors.ts` | All interaction: hover anchors, the create/re-attach gestures, click-to-duplicate, the connector layer, keeping connectors attached, cascade delete, route-based hit testing |
| `src/components/node/hooks/useNodeConnectorSync.ts` | Publishes each node's scene rectangle to the registry, re-routes on node move/resize, removes connectors of deleted nodes |
| `src/components/toolbar/options/connector-options.tsx` | Properties panel for connectors |
| `src/store/whiteboard-store.ts` | `toolOptions.connector` (last-used style) |
| `src/lib/design-tokens.ts` | Design-system colours used by canvas-drawn UI, the connector palette and the default colour |
| Wiring | `whiteboard.tsx` (hook order), `useToolManager` (`connector` tool), `useSelection` (panel sync), `useLiveUpdate` (style edits), `useCopyPaste` (id remapping), toolbar (button + `X` shortcut) |

### Data model

`Connector extends FabricObject`. Its source of truth is the two ends
(`source`, `target`) plus style. Everything else is derived by `updateRoute()`:

- `_route`: either a polyline (elbow, straight) or a cubic Bézier (curved)
- `_samples`: points along the route, used for hit testing and bounds
- `left/top/width/height`: fitted around the samples so Fabric's culling,
  selection bounds and `setCoords()` stay correct

The object is locked (`lockMovement*`, `lockScaling*`, `lockRotation`,
`hasControls: false`). It moves only by re-routing, never by being dragged.
`objectCaching` is off because a cached bitmap would go stale the moment an
attached shape moves.

### Connect targets: shapes and nodes

Connector ends are resolved through one small interface, so routing never
needs to know what it is attached to:

```ts
type ConnectTarget =
  | { kind: "object"; id; object: FabricObject; center(); anchor(side) }
  | { kind: "node";   id; rect: NodeRect;       center(); anchor(side) };
```

- **Fabric objects** (`objectTarget`): an anchor is the midpoint of a side in
  the object's local space, pushed out by half the stroke, then transformed by
  `calcTransformMatrix()`. That one matrix covers rotation, scale, flip and
  membership of an ActiveSelection. The outward direction is `anchor − center`,
  which is perpendicular to the side for any rotation or non-uniform scale.
- **Nodes** (`nodeTarget`): nodes are HTML, not Fabric objects. The overlay
  layer (`useNodeConnectorSync`) publishes each node's scene rectangle to a
  per-canvas registry (`setNodeRects`, a `WeakMap<Canvas, Map<id, rect>>`).
  - Position comes from node state (already in world coordinates).
  - Size comes from `offsetWidth/offsetHeight`, which ignore the parent's zoom
    transform, so they are already in world units.
  - A `ResizeObserver` catches size-only changes, such as a node
    expanding.
  - The sync runs in a layout effect, so the connector moves in the same frame
    as the node.

`createTargetLookup(canvas)` snapshots both sources once, and every re-route
uses it.

**Smart anchors** (`"auto"`): `getClosestSide(target, otherEnd)` picks the side
whose anchor is nearest to the other end's centre, or to its point if that end
is free. This is re-evaluated on every re-route, so a connector flips sides
naturally as you move things around.

### Routing

`updateRoute(lookup)` resolves both ends to `{ point, dir }`, where `dir` is the
outward normal, or `null` for a free end. It then builds one of three routes:

- **Straight**: `[p1, p2]`.
- **Curved**: a cubic Bézier with control points pushed out along each end's
  normal by `k = clamp(distance × 0.45, 30, 200)`. A free end aims its control
  point back toward the other end, so curves never kink.
- **Elbow** (`elbowRoute`): orthogonal routing.
  1. Snap each direction to its dominant axis. A free end faces the other end.
  2. Leave each bound end along its normal for a 24px stub (`a`, `b`).
  3. Join the stubs:
     - Both horizontal or both vertical: a Z through the midpoint. If both
       face the same way, go around the outer one. If they face away from
       each other, turn the Z the other way so the line doesn't cut back
       through either shape.
     - One horizontal, one vertical: a single L bend if it doesn't double back
       on either stub, otherwise a Z.
  4. Remove duplicate and collinear points. Corners are drawn with `arcTo`
     (radius ≤ 10px), which gives rounded elbows.

**Arrowheads** are triangles sized from the stroke width
(`7 + strokeWidth × 2.5` long, 80% as wide). They are filled and stroked with
round joins for soft corners, and the tip is pulled back by half the join
stroke so it lands on the edge. The line is trimmed back by 60% of the head
length at any end that has an arrowhead, so a round line cap never pokes
through the tip.

### Rendering: the connector layer

Nodes are HTML stacked *above* the Fabric canvas. Anything Fabric paints, a
connector included, would be hidden wherever it passes under a node. So the
live view of connectors is painted on its own layer:

- `useConnectors` inserts a transparent `<canvas aria-hidden>` into the board at
  `z-index: 60`. That is above the node overlay (50) and below the toolbar and
  panels (100). It has `pointer-events: none` and is sized for retina displays.
- On every Fabric `after:render` of the main context, the layer is cleared and
  repainted:
  1. Each connector's `renderRoute(ctx)` is drawn with the viewport transform
     applied.
  2. The interaction overlay is drawn in screen pixels: hover anchor dots, the
     drop-target outline with its edge dots, and the endpoint handles of the
     selected connector.
- `Connector._render` skips the main canvas when a layer is registered
  (`setConnectorLayer`). Any other context, such as `toDataURL` exports,
  still gets the connector drawn in place, so exports include connectors.

Connectors are Fabric objects for everything else: selection, JSON, undo and
hit testing all go through Fabric as usual. Only the painting moved.

### Hit testing

Fabric hit-tests by bounding box. For an elbow or diagonal connector that box
covers lots of empty canvas, which would swallow clicks meant for shapes
underneath. Three changes fix that:

- `Connector.containsPoint` measures the distance from the pointer to the
  sampled route, with a tolerance of 6 screen px plus half the stroke width.
- `useConnectors` wraps the canvas instance's `_checkTarget` so Fabric uses
  that test for connectors. It is restored on unmount.
- `intersectsWithRect` and `isContainedWithinRect` return `false`, which
  keeps connectors out of rubber-band selections. `intersectsWithObject`
  tests the real route, so the eraser only deletes a connector it actually
  touches.

### Interaction: the gesture state machine

`useConnectors` owns the pointer while a connector gesture is active:

```
idle ──hover──▶ hover(target, side?) ──pointerdown on dot / endpoint / (Connector tool)──▶ gesture
gesture { kind: create | reattach, end, fixedId, drop, moved }
  pointermove  → find drop target (exact hit first, then 16px margin, excluding fixedId);
                 pinned = nearest edge dot within 16px, else "auto"; re-route; repaint
  pointerup    → create+moved: commit (history, select connector, back to Select tool)
                 create+click on dot: remove preview, duplicate the shape connected
                 reattach+moved: commit
  Esc/cancel   → remove the preview, or restore the previous end
```

How it keeps Fabric and the nodes out of the way:

- Listeners are on `window` in the **capture** phase. They run before Fabric's
  listeners on the upper canvas and before React's handlers on the nodes.
- `isOnBoard()` limits them to the canvas and to elements marked
  `[data-whiteboard-node]` inside this board, so the toolbar and panels are
  never affected.
- When a gesture starts, `pointerdown` is `preventDefault()`ed and stopped,
  which suppresses the compatibility `mousedown`. A `swallowing` flag also
  stops `mousedown`, `touchstart`, `click` and `dblclick` until the gesture's
  trailing events have drained. Fabric runs with `enablePointerEvents: false`,
  so it would otherwise react to those.
- Fabric's own controls win. If the pointer is on a resize or rotate handle of
  the active object (`findControl`), the gesture doesn't start.
- Hover runs from a window `pointermove`, because over a node the events go to
  the node, not the canvas. The crosshair and grab cursors are set in Fabric's
  `mouse:move`, which runs after Fabric sets its own cursor.

Anchor dots sit 18px outside the edge in *screen* space, whatever the zoom, so
they never collide with Fabric's side handles. The hit radius is 10px for mouse
and 18px for touch.

### Staying attached

- **Shapes:** `refreshConnectors` runs on Fabric's move, scale, rotate, resize,
  skew and modify events, on `text:changed`, and on `selection:cleared`.
  It re-routes every connector against one lookup snapshot. Anchors come from
  `calcTransformMatrix()`, so this also works while shapes are inside a moving
  ActiveSelection.
- **Nodes:** `useNodeConnectorSync` re-routes whenever node state or size
  changes: drag, a box selection moved together with shapes, a document
  expanding.
- **Multi-selection:** connectors are removed from any ActiveSelection
  (`dropConnectorsFromSelection`). That hook is registered before
  `useSelection`, so the store never sees a selection containing a connector.
  Bound ends follow their shapes anyway, so a group drag never has to move
  them.
- **Reload and undo:** a connector added from JSON triggers one rAF-batched
  re-route. Node positions aren't part of canvas history, so without this a
  restored connector could point at where a node used to be.

**Cascade delete:**

- `object:removed` removes connectors attached to that object. This is
  skipped while `isRestoringRef` is set, because undo/redo reloads the whole
  canvas.
- `useNodeConnectorSync` compares node ids between renders and calls
  `removeConnectorsFor` for any node that disappeared.

### Ids, persistence, undo and copy/paste

- `id` is added to `FabricObject.customProperties`, so every object serializes
  it. `object:added` assigns a UUID to any connectable object that doesn't have
  one.
- A gesture sets `suppressHistoryRef` while the preview connector lives on the
  canvas. On commit, one snapshot is pushed.
- **Copy/paste:**
  - `useCopyPaste` also copies any connector whose two ends are both in the
    selection.
  - On paste, `reassignIds` gives every copy a fresh id and rewires connectors
    to the copies. An end whose object wasn't copied becomes free.
  - A lone connector's free ends are nudged by the same cascading 10px offset
    as other pastes.

---

## Limitations and extension points

- **No obstacle avoidance.** Routes can cross other shapes and nodes; lines
  are drawn above nodes so they stay visible. A grid or A*-based router could
  replace `elbowRoute` without touching anything else.
- **Clicks over nodes.** Where a connector passes over a node, a click there
  goes to the node. Select the connector along a visible stretch instead.
- **Free ends don't ride along with group drags.** Connectors are kept out of
  multi-selections, so a connector with free ends stays put when you drag a
  group. Bound ends follow as usual.
- **Node positions aren't in undo history** (existing design). Undo restores
  connectors, which then re-route to wherever the nodes are now.
- **No labels on connectors yet.** Add a `label` property, paint it at the
  route's midpoint in `renderRoute`, and open an `IText` editor on double-click.
- **More anchor points.** `ANCHOR_SIDES` and `SIDE_UNIT` define the four
  midpoints. Corner or custom anchors only need new entries there plus
  handling in `nearestAnchor`.
