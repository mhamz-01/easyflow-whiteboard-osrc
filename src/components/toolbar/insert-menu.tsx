"use client";

// Insert menu — lists every node type that has a `label` and adds the chosen one to the centre of the view.

import React, { useEffect, useRef } from "react";
import { Shapes } from "lucide-react";
import type { NodeTypes } from "../../types/canvas-node";

export interface InsertMenuItem {
  type: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
}

/** Node types offered in the menu, in the order they were declared. */
export const insertableTypes = (nodeTypes: NodeTypes): InsertMenuItem[] =>
  Object.entries(nodeTypes)
    .filter(([, def]) => !!def.label)
    .map(([type, def]) => ({ type, label: def.label!, description: def.description, icon: def.icon }));

/** Toolbar button that toggles the panel. */
export function InsertMenuButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <div className="group/tooltip relative">
      <button
        type="button"
        data-insert-menu-toggle
        onClick={onToggle}
        aria-label="Insert"
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-300 text-white ${
          open ? "bg-white/10" : "hover:bg-white/10"
        }`}
      >
        <Shapes className="w-5 h-5" strokeWidth={2} />
      </button>
    </div>
  );
}

/**
 * The panel. Rendered outside the toolbar's horizontal scroller so it isn't
 * clipped on small screens. Closes on outside click and Escape.
 */
export function InsertMenuPanel({
  items,
  onPick,
  onClose,
}: {
  items: InsertMenuItem[];
  onPick: (type: string) => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (panelRef.current?.contains(t) || t?.closest?.("[data-insert-menu-toggle]")) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={panelRef}
      role="menu"
      className="absolute bottom-full right-0 mb-3 w-[280px] max-w-[calc(100vw-2rem)] bg-[var(--wb-popover)]/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-[0_32px_64px_var(--wb-popover-shadow)] z-[100] pointer-events-auto"
    >
      <div className="p-4 border-b border-white/5">
        <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-400">Insert</h3>
      </div>
      <div className="max-h-80 overflow-y-auto p-2">
        {items.map((item) => (
          <button
            key={item.type}
            type="button"
            role="menuitem"
            onClick={() => onPick(item.type)}
            className="group w-full flex items-center gap-3 p-3 rounded-xl text-left border border-transparent hover:bg-white/5 hover:border-white/5 transition-all"
          >
            {item.icon && (
              <span className="flex items-center justify-center w-8 h-8 shrink-0 rounded-lg bg-white/5 text-neutral-300">
                {item.icon}
              </span>
            )}
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-neutral-100 group-hover:text-[#029AFF] transition-colors truncate">
                {item.label}
              </span>
              {item.description && (
                <span className="block text-[11px] text-neutral-500 truncate">{item.description}</span>
              )}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
