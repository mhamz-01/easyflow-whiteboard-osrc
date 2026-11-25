# Whiteboard QA report

> **Historical:** this report covers the earlier version with built-in task and
> document cards. Those were replaced by consumer-defined nodes (`nodeTypes`);
> references to cards below map to nodes today.

End-to-end testing of `easyflow-whiteboard`: what was tested, what
broke, what was fixed, and what is still open.

## How it was tested

**Real browser.**

- The library source was bundled with esbuild into a standalone page that
  renders `<EasyflowWhiteboard>` with sample task and document cards, an
  `onSave` that writes to `localStorage`, and a runtime `editable` toggle.
- The page was driven with **puppeteer-core in headless Chrome** using real
  mouse, keyboard, wheel and touch input: no calls into component internals,
  only clicks and drags at screen coordinates.
- Assertions read the resulting Fabric/store state, and pixels from the
  rendered canvases for visual checks such as "are the anchor dots visible".
- Screenshots were reviewed by hand for visual and UX problems.

**Unit level.** The connector geometry (anchor resolution, routing, hit
testing, JSON round-trip, id remapping, card targets) was also tested in Node
with Fabric's `jsdom` build, and the routes were rendered to PNG for inspection.

| Suite | Checks | Covers |
|---|---:|---|
| Core tools | 34 | Every tool shortcut; drawing rect, circle, frame, line, arrow, pen, text; frame stays behind; select and drag; Delete; undo/redo; copy/paste with unique ids; Ctrl+wheel and Ctrl+0 zoom; zoom label; Hand tool panning, including starting over a card; cards panning with the canvas; eraser; `onSave` payload |
| Connectors | 42 | Design-system default colour and palette; hover glow on and off; hover anchors; crosshair cursor; drag-to-connect; pinned vs smart anchors; auto-selection and properties panel; route-based hit testing; following moved shapes; route type and arrowhead toggles; re-attaching to a card; following a dragged card; `Esc` cancel; click-to-duplicate; Connector tool from empty canvas and from a card body; card hover anchors; card → shape; rubber band skipping connectors; multi-select drag; cascade delete for shapes and cards; undo restoring connectors |
| Persistence, modes, input | 21 | Save → reload with a shape → card connector; restored ends on card edges; following after reload; read-only mode (no anchors, no creation, no movement, Connector tool disabled, runtime toggle back); connecting at 150% zoom after panning; click-selection after pan; typing `x`/`b`/Backspace inside a text box; connecting from text; add-task dropdown; touch tap-select and finger drag from an anchor; phone viewport with the retina-sized connector layer |
| Minimap | 16 | Renders bottom-right; cards and far-away shapes appear in the right colours; click-to-jump centres the view; dragging the viewport box pans proportionally; Fit brings every shape and card into view at ≤100% and updates the zoom label; Ctrl+wheel zooms, plain wheel is ignored; cards stay aligned after map navigation; drawing tools ignore drags on the map; collapse/expand; sits above the toolbar at 1024px; hidden on phones |
| Visual | 2 | New card stacks on top; inactive toolbar buttons are transparent without a host CSS reset |
| Node (unit) | 37 | Routing for all three line types, rotated targets, bounds, hit testing, JSON round-trip, id remapping, card anchors, following cards, unloaded cards, cascade delete |

**Final result: all 152 checks pass** (115 in the browser, 37 in Node).

## Issues found and fixed

### 1. Undo/redo broke after autosave (existing bug)

**Symptom:**
- After an undo, waiting a moment made redo do nothing.
- The next undo often looked like a no-op, so undo needed two presses.
- Drawing a shape also recorded two identical history entries.

**Cause:**
- Undo reloads the canvas. That fires `object:added` for every object, and the
  debounced autosave then pushed the restored state back onto history. That
  truncated the redo stack and added a duplicate entry.
- A plain equality check wasn't enough: the reloaded canvas serializes a few
  fields slightly differently (for example `strokeDashArray: null` versus
  omitted), so the strings never matched.

**Fix:**
- `pushHistory` ignores a snapshot identical to the current entry.
- After an undo/redo restore, the toolbar stores the canvas's fresh
  serialization in the current slot (`replaceCurrentHistory`), so the autosave
  that follows matches it exactly.
- Files: `whiteboard-store.ts`, `whiteboard-toolbar.tsx`.

### 2. Connectors disappeared under task/document cards

**Symptom:** a connector passing near cards vanished wherever it crossed one,
and clicks aimed at it hit the card instead.

**Cause:** cards are HTML layered above the Fabric canvas, and connectors were
painted on the canvas.

**Fix:**
- Connectors, anchor dots and drop highlights are painted on a dedicated layer
  above the cards (pointer-events off). Exports still draw connectors in place.
- See [CONNECTORS.md → Rendering](./CONNECTORS.md#rendering-the-connector-layer).

### 3. The Hand tool dragged cards instead of panning (UX)

**Symptom:**
- Starting a pan over a card moved the card.
- Shapes and pen strokes couldn't be started on top of a card.

**Fix:**
- Cards only take pointer input with the Select tool. With any other tool,
  events fall through to the canvas.
- The Connector tool still attaches to cards through the card registry.
- File: `custom-node-overlay-layer.tsx`.

### 4. Browser-default button styling without a host CSS reset

**Symptom:** in an app without Tailwind preflight, every inactive tool button,
the zoom buttons and the zoom input showed the browser's light-grey button
background. White icons on light grey were nearly invisible.

**Cause:** `styles.css` deliberately omits preflight, and nothing else reset
`<button>` and `<input>`.

**Fix:**
- A minimal reset scoped to `.easyflow-whiteboard` and its portalled dropdown
  menus.
- It is wrapped in `:where()` (zero specificity) inside the `base` layer, which
  is declared before `utilities`, so every Tailwind class still wins and host
  apps that already have a reset see no change.
- File: `src/styles.css`.

### 5. New cards appeared underneath existing ones (UX)

**Symptom:** a task added from the toolbar at the viewport centre was rendered
*behind* a document card already there.

**Cause:** cards stacked in fixed tasks-then-documents DOM order.

**Fix:**
- Cards stack by recency: a newly added card, or the last selected one, goes on
  top.
- Dragged cards float above all of them.
- File: `custom-node-overlay-layer.tsx`.

### 6. Console warning on every load and undo

**Symptom:** `fabric Setting type has no effect arrow` was logged for every
arrow on load and on each undo.

**Cause:** `Arrow.fromObject` and `BidirectionalArrow.fromObject` passed the
serialized `type` back into the constructor.

**Fix:** strip `type` before constructing. Files: `fabric-arrow.ts`,
`fabric-bidirectional-arrow.ts`.

### 7. Connector bugs caught while building

- **Export crash:** connector rendering crashed on a plain `StaticCanvas`,
  which Fabric uses for exports, because it called `getActiveObject`. This is
  now guarded.
- **Touch conflict:** on touch, the larger anchor hit area overlapped Fabric's
  side resize handles. Fabric's handles now take priority.

## Verified working (no change needed)

- **Drawing:** all drawing tools, their shortcuts, and returning to Select
  after drawing. Frames stay behind other objects.
- **Selecting:** select, move and delete; clicking still selects correctly
  after panning and zooming.
- **Clipboard:** copy/paste with a cascading offset and unique ids.
- **Zoom and pan:** Ctrl+wheel, Ctrl+0 and the zoom label; the Hand tool;
  cards stay aligned with the canvas while panning.
- **Eraser:** removes what it touches, including connectors it actually
  crosses.
- **Text:** tool shortcuts and Delete/Backspace are ignored while typing in a
  text box.
- **Saving:** `onSave` carries the canvas JSON and card data, and reloading
  restores everything, including connectors to cards.
- **Read-only mode:** blocks every mutation and can be toggled at runtime.
- **Adding cards:** the task/document dropdowns add cards at the viewport
  centre.
- **Touch:** tap-select, and dragging a connector from a selected shape.

## Known limitations (not changed)

- **Font:** the library inherits the host page's font. Without one, text falls
  back to the browser default serif. That is intentional so it matches the host
  app; set `font-family` on the whiteboard container, or a parent, if needed.
- **Card positions aren't in undo history.** Undo covers canvas objects only.
  This is existing design.
- **No obstacle avoidance** in connector routing, and connector segments that
  pass over a card can't be clicked there. See
  [CONNECTORS.md](./CONNECTORS.md#limitations-and-extension-points).

## Re-running the browser tests

The harness lives outside the package; it isn't published or committed. It
needs:

1. An esbuild bundle of `src/index.ts` with a small host page (sample cards,
   `onSave` → `localStorage`, an `editable` toggle, a hook exposing the Fabric
   canvas and the store on `window`).
2. `puppeteer-core` pointed at the installed Chrome.
3. The suites above, written as real pointer, keyboard and touch sequences
   with assertions on canvas and store state.

If you want it in the repo as `e2e/` with an `npm run test:e2e` script, it can
be added as-is.
