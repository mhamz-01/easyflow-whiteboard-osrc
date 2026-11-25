"use client";

// Bottom toolbar — renders all tool buttons, keyboard shortcuts, undo/redo, image upload, and the node Insert menu.

import React, { useEffect, useRef, MutableRefObject, useState, useCallback, useMemo } from "react";
import {
  MousePointer2, Pencil, Square, Circle, Minus, MoveRight,
  Type, Eraser, Hand, Frame, Undo2, Redo2, Image as ImageIcon, Waypoints,
} from "lucide-react";
import { Canvas, util } from "fabric";
import { useWhiteboardStore } from "../../store/whiteboard-store";
import ToolButton from "./toolbar-button";
import ToolbarSeparator from "./toolbar-seperator";
import { InsertMenuButton, InsertMenuPanel, type InsertMenuItem } from "./insert-menu";
import { deleteSelectedObjects, addImageToCanvas } from "../../lib/fabric-utils";
import { isTypingTarget } from "../../lib/utils";

const TOOLS = [
  { id: "select", icon: MousePointer2, label: "Select", shortcut: "V", category: "basic" },
  { id: "pan", icon: Hand, label: "Pan", shortcut: "H", category: "navigation" },
  { id: "pen", icon: Pencil, label: "Pen", shortcut: "P", category: "drawing" },
  { id: "rectangle", icon: Square, label: "Rectangle", shortcut: "R", category: "shapes" },
  { id: "circle", icon: Circle, label: "Circle", shortcut: "C", category: "shapes" },
  { id: "frame", icon: Frame, label: "Frame", shortcut: "F", category: "shapes" },
  { id: "line", icon: Minus, label: "Line", shortcut: "L", category: "shapes" },
  { id: "arrow", icon: MoveRight, label: "Arrow", shortcut: "A", category: "shapes" },
  { id: "connector", icon: Waypoints, label: "Connector", shortcut: "X", category: "shapes" },
  { id: "text", icon: Type, label: "Text", shortcut: "T", category: "drawing" },
  { id: "image", icon: ImageIcon, label: "Image", shortcut: "I", category: "media" },
  { id: "eraser", icon: Eraser, label: "Eraser", shortcut: "E", category: "drawing" },
  { id: "undo", icon: Undo2, label: "Undo", shortcut: "⌘Z", category: "history" },
  { id: "redo", icon: Redo2, label: "Redo", shortcut: "⌘⇧Z", category: "history" },
] as const;

// Tools that remain usable in read-only mode — everything else mutates the canvas.
const READ_ONLY_ALLOWED_TOOLS = new Set(["select", "pan"]);

interface WhiteboardToolbarProps {
  fabricCanvas: MutableRefObject<Canvas | null>;
  isRestoringRef: MutableRefObject<boolean>;
  /** Node types listed in the Insert menu; the menu is hidden when empty. */
  insertItems?: InsertMenuItem[];
  onInsertNode?: (type: string) => void;
}

// ── Memoized ToolButton wrapper ───────────────────────────────────────────────
const MemoizedToolButton = React.memo(ToolButton);
const MemoizedToolbarSeparator = React.memo(ToolbarSeparator);

// ── Main Component ────────────────────────────────────────────────────────────

export default React.memo(function WhiteboardToolbar({
  fabricCanvas,
  isRestoringRef,
  insertItems = [],
  onInsertNode,
}: WhiteboardToolbarProps) {
  const activeTool = useWhiteboardStore((s) => s.activeTool);
  const setActiveTool = useWhiteboardStore((s) => s.setActiveTool);
  const canUndo = useWhiteboardStore((s) => s.canUndo);
  const canRedo = useWhiteboardStore((s) => s.canRedo);
  const undo = useWhiteboardStore((s) => s.undo);
  const redo = useWhiteboardStore((s) => s.redo);
  const editable = useWhiteboardStore((s) => s.editable);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [scrollPosition, setScrollPosition] = useState(0);
  const [insertOpen, setInsertOpen] = useState(false);
  const closeInsert = useCallback(() => setInsertOpen(false), []);
  const toggleInsert = useCallback(() => {
    setInsertOpen((open) => {
      if (!open) setActiveTool("select");
      return !open;
    });
  }, [setActiveTool]);
  const pickInsert = useCallback((type: string) => {
    setInsertOpen(false);
    onInsertNode?.(type);
  }, [onInsertNode]);

  // ── Memoized callbacks ────────────────────────────────────────────────────────

  const handleScroll = useCallback(() => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      const position = scrollLeft / (scrollWidth - clientWidth);
      setScrollPosition(position);
    }
  }, []);

  // ── Restore helper (memoized) ─────────────────────────────────────────────────
  const restoreCanvas = useCallback((canvas: Canvas, json: string) => {
    isRestoringRef.current = true;
    canvas.loadFromJSON(JSON.parse(json)).then(() => {
      canvas.isDrawingMode = false;
      canvas.selection = true;
      canvas.forEachObject((obj) => {
        obj.selectable = true;
        obj.evented = true;
      });
      canvas.renderAll();
      useWhiteboardStore.getState().replaceCurrentHistory(JSON.stringify(canvas.toJSON()));
      setActiveTool("select");
      isRestoringRef.current = false;
    });
  }, [setActiveTool, isRestoringRef]);

  // ── Handle tool click (memoized) ──────────────────────────────────────────────
  const handleToolClick = useCallback(
    (toolId: string) => {
      if (!editable && !READ_ONLY_ALLOWED_TOOLS.has(toolId)) return;

      const canvas = fabricCanvas.current;
      if (!canvas) return;

      canvas.discardActiveObject();
      canvas.renderAll();

      if (toolId === "undo") {
        const state = undo();
        if (state) restoreCanvas(canvas, state);
        return;
      }

      if (toolId === "redo") {
        const state = redo();
        if (state) restoreCanvas(canvas, state);
        return;
      }

      if (toolId === "image") {
        fileInputRef.current?.click();
        return;
      }

      setActiveTool(toolId as any);
    },
    [fabricCanvas, undo, redo, restoreCanvas, setActiveTool, editable]
  );

  // ── Handle image upload (memoized) ────────────────────────────────────────────
  const handleImageUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !file.type.startsWith("image/")) return;

      const canvas = fabricCanvas.current;
      if (!canvas) return;

      const reader = new FileReader();
      reader.onload = (ev) => {
        const url = ev.target?.result as string;
        if (url) addImageToCanvas(canvas, url);
      };
      reader.readAsDataURL(file);
      e.target.value = "";
    },
    [fabricCanvas]
  );

  // ── Hero animation effect ─────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = fabricCanvas.current;
    if (!canvas || activeTool === "select") return;

    const hero = canvas.getObjects().find((obj) => (obj as any).id === "welcome-hero");

    if (hero) {
      hero.animate(
        {
          opacity: 0,
          top: (hero.top || 0) - 20,
        },
        {
          duration: 500,
          easing: util.ease.easeInQuad,
          onChange: () => canvas.requestRenderAll(),
          onComplete: () => {
            canvas.remove(hero);
            canvas.requestRenderAll();
          },
        }
      );
    }
  }, [activeTool, fabricCanvas]);

  // ── Keyboard shortcuts effect ─────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;

      const key = e.key.toLowerCase();
      const ctrl = e.ctrlKey || e.metaKey;

      const shortcuts: Record<string, string> = {
        v: "select",
        h: "pan",
        p: "pen",
        r: "rectangle",
        c: "circle",
        f: "frame",
        l: "line",
        a: "arrow",
        x: "connector",
        t: "text",
        i: "image",
        e: "eraser",
      };

      if (shortcuts[key] && !ctrl) {
        e.preventDefault();
        handleToolClick(shortcuts[key]);
        return;
      }

      if (key === "delete" || key === "backspace") {
        if (editable && fabricCanvas.current && activeTool === "select") {
          e.preventDefault();
          deleteSelectedObjects(fabricCanvas.current);
        }
        return;
      }

      if (ctrl) {
        if (key === "z" && !e.shiftKey) {
          e.preventDefault();
          handleToolClick("undo");
        } else if ((key === "z" && e.shiftKey) || key === "y") {
          e.preventDefault();
          handleToolClick("redo");
        }
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fabricCanvas, activeTool, handleToolClick, editable]);

  // ── Memoized tool buttons ─────────────────────────────────────────────────────
  const toolButtons = useMemo(
    () =>
      TOOLS.map((tool, index) => (
        <div key={tool.id} className="flex items-center snap-center">
          <MemoizedToolButton
            icon={tool.icon}
            label={tool.label}
            isActive={activeTool === tool.id}
            onClick={() => handleToolClick(tool.id)}
            disabled={
              (tool.id === "undo" && !canUndo) ||
              (tool.id === "redo" && !canRedo) ||
              (!editable && !READ_ONLY_ALLOWED_TOOLS.has(tool.id))
            }
            shortcut={tool.shortcut}
          />
          {(index === 1 || index === 10) && (
            <div className="hidden md:block mx-1">
              <MemoizedToolbarSeparator />
            </div>
          )}
        </div>
      )),
    [activeTool, canUndo, canRedo, handleToolClick, editable]
  );

  // ── Insert menu button ────────────────────────────────────────────────────────
  const showInsert = editable && insertItems.length > 0 && !!onInsertNode;
  const insertSection = showInsert && (
    <div className="flex items-center gap-1 snap-center pr-2">
      <div className="mx-1 flex-shrink-0">
        <MemoizedToolbarSeparator />
      </div>
      <InsertMenuButton open={insertOpen} onToggle={toggleInsert} />
    </div>
  );

  // ── Scroll indicator visibility ───────────────────────────────────────────────
  const scrollIndicators = useMemo(
    () => (
      <div className="flex gap-1.5 md:hidden">
        <div
          className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
            scrollPosition < 0.5 ? "bg-white w-6" : "bg-white/30"
          }`}
        />
        <div
          className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
            scrollPosition >= 0.5 ? "bg-white w-6" : "bg-white/30"
          }`}
        />
      </div>
    ),
    [scrollPosition]
  );

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageUpload}
        className="hidden"
      />

      <div className="fixed bottom-4 md:bottom-6 left-0 right-0 z-50 flex flex-col items-center gap-2 px-4 pointer-events-none">
        <div className="relative w-full md:w-auto max-w-full pointer-events-auto">
          {/* Gradients */}
          <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-[var(--wb-bg)] to-transparent pointer-events-none z-10 md:hidden rounded-l-2xl" />
          <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-[var(--wb-bg)] to-transparent pointer-events-none z-10 md:hidden rounded-r-2xl" />

          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="flex items-center gap-1 px-2 py-2 bg-[var(--wb-surface)]/95 backdrop-blur-md border border-[var(--wb-toolbar-border)] rounded-2xl shadow-2xl overflow-x-auto md:overflow-x-visible snap-x snap-mandatory md:snap-none scrollbar-hide scroll-smooth"
          >
            {toolButtons}
            {insertSection}
          </div>

          {showInsert && insertOpen && (
            <InsertMenuPanel items={insertItems} onPick={pickInsert} onClose={closeInsert} />
          )}
        </div>

        {/* Scroll Indicators */}
        {scrollIndicators}
      </div>

      <style>{`
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { 
          -ms-overflow-style: none; 
          scrollbar-width: none;
          -webkit-overflow-scrolling: touch;
        }
      `}</style>
    </>
  );
}, (prev, next) => {
  // Custom comparator for React.memo
  // Return true to skip re-render, false to re-render
  return (
    prev.fabricCanvas === next.fabricCanvas &&
    prev.isRestoringRef === next.isRestoringRef &&
    prev.insertItems === next.insertItems &&
    prev.onInsertNode === next.onInsertNode
  );
});