// Publishes each HTML node's scene rect to the connector registry, re-routes connectors as cards move or resize, and removes connectors of deleted cards.

import { useCallback, useLayoutEffect, useReducer, useRef, useEffect } from "react";
import type { RefObject } from "react";
import type { Canvas } from "fabric";
import type { NodeTypes, WhiteboardNode } from "../../../types/canvas-node";
import { NodeRect, refreshConnectors, removeConnectorsFor, setNodeRects } from "../../../lib/fabric-connector";

interface UseNodeConnectorSyncProps {
  fabricCanvas?: RefObject<Canvas | null>;
  canvasReady: boolean;
  localNodes: WhiteboardNode[];
  nodeTypes: NodeTypes;
}

/**
 * SRP: bridges the HTML cards and the Fabric-side connectors.
 *
 * Card positions come from state (world coords); card sizes come from the DOM.
 * offsetWidth/offsetHeight ignore the parent's zoom transform, so they're
 * already in world units. A ResizeObserver catches size-only changes such as
 * a node expanding.
 */
export function useNodeConnectorSync({
  fabricCanvas,
  canvasReady,
  localNodes,
  nodeTypes,
}: UseNodeConnectorSyncProps) {
  const elementsRef = useRef(new Map<string, HTMLElement>());
  const refCallbacksRef = useRef(new Map<string, (el: HTMLElement | null) => void>());
  const prevIdsRef = useRef(new Set<string>());
  const [sizeVersion, bumpSize] = useReducer((n: number) => n + 1, 0);

  const observerRef = useRef<ResizeObserver | null>(null);
  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => bumpSize());
    observerRef.current = observer;
    elementsRef.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  /** Stable ref callback per card id — attach to the card's positioned wrapper. */
  const registerNode = useCallback((id: string) => {
    let cb = refCallbacksRef.current.get(id);
    if (!cb) {
      cb = (el: HTMLElement | null) => {
        const prev = elementsRef.current.get(id);
        if (prev && prev !== el) observerRef.current?.unobserve(prev);
        if (el) {
          elementsRef.current.set(id, el);
          observerRef.current?.observe(el);
        } else {
          elementsRef.current.delete(id);
          refCallbacksRef.current.delete(id);
        }
      };
      refCallbacksRef.current.set(id, cb);
    }
    return cb;
  }, []);

  // Layout effect: runs before paint, so connectors move in the same frame as the card.
  useLayoutEffect(() => {
    const canvas = fabricCanvas?.current;
    if (!canvas || !canvasReady) return;

    const rects = new Map<string, NodeRect>();
    for (const node of localNodes) {
      const el = elementsRef.current.get(node.id);
      if (el) rects.set(node.id, {
        x: node.x, y: node.y, width: el.offsetWidth, height: el.offsetHeight,
        color: nodeTypes[node.type]?.minimapColor,
      });
    }
    setNodeRects(canvas, rects);

    const ids = new Set(localNodes.map((n) => n.id));
    const gone = new Set([...prevIdsRef.current].filter((id) => !ids.has(id)));
    prevIdsRef.current = ids;
    if (gone.size) removeConnectorsFor(canvas, gone);

    refreshConnectors(canvas);
    canvas.requestRenderAll();
  }, [fabricCanvas, canvasReady, localNodes, nodeTypes, sizeVersion]);

  /** Measured size in world units; offsetWidth/Height ignore the zoom transform. */
  const getNodeSize = useCallback((id: string) => {
    const el = elementsRef.current.get(id);
    return el ? { width: el.offsetWidth, height: el.offsetHeight } : { width: 0, height: 0 };
  }, []);

  return { registerNode, getNodeSize };
}
