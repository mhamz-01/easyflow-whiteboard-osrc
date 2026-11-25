// Debounced auto-save — pushes canvas snapshots to the undo/redo history and calls the consumer's onSave callback.

import React, { useEffect, useRef } from "react";
import { Canvas } from "fabric";
import type { WhiteboardNode } from "../types/canvas-node";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WhiteboardSavePayload<T = any> {
  /** Serialized Fabric canvas (`JSON.stringify(canvas.toJSON())`). */
  canvas: string;
  /** Every HTML node, with world-space positions and your `data`. */
  nodes: WhiteboardNode<T>[];
}

interface UsePersistenceProps {
  fabricCanvas: React.RefObject<Canvas | null>;
  nodes: WhiteboardNode[];
  pushHistory: (state: string) => void;
  isRestoringRef: React.RefObject<boolean>;
  suppressHistoryRef: React.RefObject<boolean>;
  // Consumer passes this — called on debounce when anything changes.
  // Consumer is responsible for persisting to their DB.
  onSave?: (payload: WhiteboardSavePayload) => void;
  // Debounce delay in ms — default 2000. Consumer can tune this.
  saveDebounceMs?: number;
  /** The node list that was just loaded from initialData; it isn't a change, so it doesn't trigger a save. */
  loadedNodesRef?: React.RefObject<WhiteboardNode[] | null>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export const usePersistence = ({
  fabricCanvas,
  nodes,
  pushHistory,
  isRestoringRef,
  suppressHistoryRef,
  onSave,
  saveDebounceMs = 2000,
  loadedNodesRef,
}: UsePersistenceProps) => {

  // Refs so debounced callbacks always read latest values without re-registering
  const onSaveRef        = useRef(onSave);
  const nodesRef         = useRef(nodes);
  const pushHistoryRef   = useRef(pushHistory);

  onSaveRef.current      = onSave;
  nodesRef.current       = nodes;
  pushHistoryRef.current = pushHistory;

  // Stable idleCallback handle for cancellation
  const idleHandleRef    = useRef<number | null>(null);
  const saveTimeoutRef   = useRef<number | undefined>(undefined);

  // ── Core save function ────────────────────────────────────────────────────
  // Reads latest state from refs — safe to call from any closure regardless
  // of when it was created (no stale capture possible).
  // ── Core save function ────────────────────────────────────────────────────
  const performSave = useRef(() => {
    const canvas = fabricCanvas.current;
    if (!canvas) return;
    if (isRestoringRef.current) return;
    // Mid-gesture (drawing, erasing, dragging a connector): try again shortly
    // instead of dropping the save, or a gesture longer than the debounce
    // would never be saved.
    if (suppressHistoryRef.current) {
      scheduleSave.current();
      return;
    }

    try {
      const canvasJson = JSON.stringify(canvas.toJSON());

      // Create the final payload object
      const payload: WhiteboardSavePayload = {
        canvas: canvasJson,
        nodes:  nodesRef.current,
      };

    

      // Push to undo/redo history
      pushHistoryRef.current(canvasJson);

      // Notify consumer
      onSaveRef.current?.(payload);
      
    } catch (err) {
      console.error("[usePersistence] Save failed:", err);
    }
  });

  // ── Debounced trigger ─────────────────────────────────────────────────────
  // Uses requestIdleCallback when available so the JSON serialization
  // (which can be expensive for complex canvases) runs during browser idle time
  // and doesn't block the main thread / animation frames.
  const scheduleSave = useRef(() => {
    clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = window.setTimeout(() => {
      if (typeof window.requestIdleCallback === "function") {
        // Cancel any previously scheduled idle callback before scheduling new one
        if (idleHandleRef.current !== null) {
          window.cancelIdleCallback(idleHandleRef.current);
        }
        idleHandleRef.current = window.requestIdleCallback(() => {
          performSave.current();
          idleHandleRef.current = null;
        });
      } else {
        performSave.current();
      }
    }, saveDebounceMs);
  });

  // ── Canvas event listeners ────────────────────────────────────────────────
  // Registered once — all values read via refs so no re-registration needed.
  useEffect(() => {
    const canvas = fabricCanvas.current;
    if (!canvas) return;

    const debouncedSave = (opt?: any) => {
      // Skip objects that are explicitly excluded (e.g. selection rect, guides)
      if (opt?.target?.excludeFromExport) return;
      scheduleSave.current();
    };

    canvas.on("object:modified", debouncedSave);
    canvas.on("object:added",    debouncedSave);
    canvas.on("object:removed",  debouncedSave);
    canvas.on("path:created",    debouncedSave);

    return () => {
      canvas.off("object:modified", debouncedSave);
      canvas.off("object:added",    debouncedSave);
      canvas.off("object:removed",  debouncedSave);
      canvas.off("path:created",    debouncedSave);

      // Cancel any pending save on unmount
      clearTimeout(saveTimeoutRef.current);
      if (idleHandleRef.current !== null) {
        window.cancelIdleCallback(idleHandleRef.current);
      }
    };
  }, [fabricCanvas]); // [] effectively — fabricCanvas ref is stable

  // ── HTML nodes watcher ──────────────────────────────────────────────────
  // Fires when HTML nodes are added, moved, or deleted.
  // Uses the same debounced save so rapid node moves don't flood the consumer.
  // The mount run is skipped: an empty board isn't a change worth saving.
  const isFirstNodesRunRef = useRef(true);
  useEffect(() => {
    if (isFirstNodesRunRef.current) { isFirstNodesRunRef.current = false; return; }
    if (isRestoringRef.current) return;
    if (loadedNodesRef?.current && nodes === loadedNodesRef.current) return;
    scheduleSave.current();
    // No cleanup needed — saveTimeoutRef cleanup happens in the canvas effect above
  }, [nodes, isRestoringRef]);

  /** Drop a save that is waiting to run (used right after the initial load, which isn't an edit). */
  const cancelPendingSave = useRef(() => {
    clearTimeout(saveTimeoutRef.current);
    if (idleHandleRef.current !== null && typeof window.cancelIdleCallback === "function") {
      window.cancelIdleCallback(idleHandleRef.current);
      idleHandleRef.current = null;
    }
  });

  return { cancelPendingSave: cancelPendingSave.current };
};
