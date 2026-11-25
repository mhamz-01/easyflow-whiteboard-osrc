// Ctrl+C / Ctrl+V clipboard for Fabric objects — clones on copy, re-clones on paste with a cascading 10px offset.

import { useEffect, useRef, RefObject } from "react";
import { Canvas, FabricObject, ActiveSelection } from "fabric";
import { useWhiteboardStore } from "../store/whiteboard-store";
import { Connector, getConnectors, isConnector, reassignIds, refreshConnectors } from "../lib/fabric-connector";
import { isTypingTarget } from "../lib/utils";

interface UseCopyPasteProps {
  fabricCanvas: RefObject<Canvas | null>;
}

interface Clipboard {
  main: FabricObject;
  /** Connectors running between the copied objects — pasted alongside, rewired to the copies. */
  connectors: Connector[];
}

export const useCopyPaste = ({ fabricCanvas }: UseCopyPasteProps) => {
  const clipboardRef = useRef<Clipboard | null>(null);
  const editable = useWhiteboardStore((s) => s.editable);

  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (
        isTypingTarget(e.target)
      ) return;

      const canvas = fabricCanvas.current;
      if (!canvas) return;

      // ── Copy ────────────────────────────────────────────────────────────
      if ((e.ctrlKey || e.metaKey) && e.key === "c") {
        const active = canvas.getActiveObject();
        if (!active) return;
        // Clone once at copy time — store as-is, exactly like official docs
        const cloned = await active.clone();
        const copiedIds = new Set(canvas.getActiveObjects().map((o) => (o as any).id).filter(Boolean));
        const connectors = await Promise.all(
          getConnectors(canvas)
            .filter((c) => c !== active && copiedIds.has(c.source.id) && copiedIds.has(c.target.id))
            .map((c) => c.clone() as Promise<Connector>)
        );
        clipboardRef.current = { main: cloned, connectors };
        return;
      }

      // ── Paste ────────────────────────────────────────────────────────────
      if ((e.ctrlKey || e.metaKey) && e.key === "v") {
        if (!editable) return;
        const copied = clipboardRef.current;
        if (!copied) return;

        // Clone again so multiple pastes work independently
        const clonedObj = await copied.main.clone();
        const connectors = await Promise.all(copied.connectors.map((c) => c.clone() as Promise<Connector>));
        const pasted = clonedObj instanceof ActiveSelection ? clonedObj.getObjects() : [clonedObj];
        // Copies get their own ids; connectors between copies point at the copies.
        reassignIds([...pasted, ...connectors]);

        canvas.discardActiveObject();

        clonedObj.set({
          left:    clonedObj.left + 10,
          top:     clonedObj.top  + 10,
          evented: true,
        });

        if (clonedObj instanceof ActiveSelection) {
          // Official docs pattern exactly:
          // set canvas reference on the ActiveSelection FIRST,
          // then use forEachObject to add children — not getObjects()
          // forEachObject is the correct API for iterating ActiveSelection
          clonedObj.canvas = canvas;
          clonedObj.forEachObject((obj: FabricObject) => {
            canvas.add(obj);
          });
          // setCoords on the selection itself — not on individual children
          clonedObj.setCoords();
        } else {
          canvas.add(clonedObj);
        }

        // A lone connector has no copied shapes to follow, so nudge its free
        // ends by the same cascading offset as everything else.
        if (isConnector(clonedObj)) {
          for (const c of [clonedObj, copied.main as Connector]) {
            for (const end of [c.source, c.target]) { end.x += 10; end.y += 10; }
          }
        }
        connectors.forEach((c) => canvas.add(c));
        refreshConnectors(canvas);

        // Official docs pattern: offset clipboard itself for cascading paste
        // This is simpler and safer than storing new clones as clipboard
        copied.main.top  += 10;
        copied.main.left += 10;

        canvas.setActiveObject(clonedObj);
        canvas.requestRenderAll();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [fabricCanvas, editable]);
};