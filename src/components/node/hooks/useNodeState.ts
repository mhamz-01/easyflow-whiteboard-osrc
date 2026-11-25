// Owns the overlay's local node list (moved every frame during drags) and keeps it in sync with the parent's nodes.

import { useState, useRef } from "react";
import type { WhiteboardNode } from "../../../types/canvas-node";

/**
 * Local copy of the nodes. Drags update it every frame without touching the
 * parent; the parent only hears about the result when the gesture commits.
 *
 * A new `nodes` prop replaces the local copy during render (React's
 * "adjust state while rendering" pattern), not in an effect. An effect would
 * leave one render where the local copy is stale, and anything reading it in
 * that window (the ref API, updateData) would drop the newest nodes.
 */
export function useNodeState(nodes: WhiteboardNode[]) {
  const [localNodes, setLocalNodes] = useState<WhiteboardNode[]>(nodes);
  const [syncedFrom, setSyncedFrom] = useState(nodes);

  let current = localNodes;
  if (nodes !== syncedFrom) {
    setSyncedFrom(nodes);
    setLocalNodes(nodes);
    current = nodes;
  }

  const localNodesRef = useRef(current);
  localNodesRef.current = current;

  return { localNodes: current, setLocalNodes, localNodesRef };
}
