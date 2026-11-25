"use client";

// Connector options panel — live style preview, route (elbow/curved/straight), arrowheads, line style, design-system colours, and width.

import { MousePointerClick } from "lucide-react";
import { useWhiteboardStore } from "../../../store/whiteboard-store";
import { cn } from "../../../lib/utils";
import { CONNECTOR_PALETTE, EF } from "../../../lib/design-tokens";
import type { ConnectorLineType } from "../../../lib/fabric-connector";

const LINE_TYPES: { id: ConnectorLineType; label: string; icon: string }[] = [
  { id: "elbow",    label: "Elbow",    icon: "M4 18 H12 V6 H20" },
  { id: "curved",   label: "Curved",   icon: "M4 18 C13 18 11 6 20 6" },
  { id: "straight", label: "Straight", icon: "M4 18 L20 6" },
];

// Dash patterns are multiples of the stroke width (see calculateDashArray).
// Dotted uses a near-zero dash with round caps, which draws true dots.
const STROKE_STYLES = [
  { id: "solid",  label: "Solid",  dashArray: null },
  { id: "dashed", label: "Dashed", dashArray: [4, 3] },
  { id: "dotted", label: "Dotted", dashArray: [0.01, 2.5] },
] as const;

const strokeStyleOf = (dash: number[] | null) =>
  !dash || !dash.length ? "solid" : dash[0] <= 2 ? "dotted" : "dashed";

// Preview paths, sized for the 220×56 preview box.
const PREVIEW_PATHS: Record<ConnectorLineType, string> = {
  elbow:    "M24 40 H96 Q106 40 106 30 V26 Q106 16 116 16 H196",
  curved:   "M24 40 C110 40 110 16 196 16",
  straight: "M24 40 L196 16",
};

// ── Small building blocks ─────────────────────────────────────────────────────

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--wb-text-muted)]">{children}</label>
);

/** Segmented control: one rounded track, the active option gets a Primary Blue treatment. */
function Segmented<T extends string>({
  options, value, onChange, render,
}: {
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  render: (id: T, active: boolean) => React.ReactNode;
}) {
  return (
    <div className="flex gap-1 p-1 rounded-[10px] bg-white/[0.04] border border-white/10">
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            aria-pressed={active}
            className={cn(
              "flex-1 h-11 rounded-[8px] flex flex-col items-center justify-center gap-0.5 transition-colors duration-150",
              active
                ? "bg-[#0D8EFF]/15 text-white ring-1 ring-inset ring-[#0D8EFF]/60"
                : "text-[var(--wb-text-muted)] hover:text-white hover:bg-white/[0.06]"
            )}
          >
            {render(o.id, active)}
            <span className="text-[10px] font-medium leading-none">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export default function ConnectorOptions() {
  const options = useWhiteboardStore((state) => state.toolOptions.connector);
  const setToolOption = useWhiteboardStore((state) => state.setToolOption);
  const set = (key: keyof typeof options, value: unknown) => setToolOption("connector", key, value);

  const { strokeColor, strokeWidth, strokeDashArray, lineType, startArrow, endArrow } = options;
  const strokeStyle = strokeStyleOf(strokeDashArray);
  const previewDash = strokeDashArray?.map((v) => v * strokeWidth).join(" ");

  return (
    <div className="space-y-5 text-[var(--wb-text-strong)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--wb-text-muted)]">Connector</p>

      {/* Live preview of exactly what the next connector (or the selected one) looks like */}
      <div className="rounded-[10px] border border-white/10 bg-[var(--wb-preview-bg)] overflow-hidden" aria-hidden="true">
        <svg viewBox="0 0 220 56" className="block w-full h-14">
          <defs>
            <marker id="ef-conn-head" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse" markerUnits="strokeWidth">
              <path d="M1 1.5 L8.5 5 L1 8.5 Z" fill={strokeColor} stroke={strokeColor} strokeWidth="1.2" strokeLinejoin="round" />
            </marker>
          </defs>
          <rect x="4" y="30" width="18" height="20" rx="5" fill="var(--wb-preview-node)" />
          <rect x="198" y="6" width="18" height="20" rx="5" fill="var(--wb-preview-node)" />
          <path
            d={PREVIEW_PATHS[lineType]}
            fill="none"
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={previewDash}
            markerStart={startArrow ? "url(#ef-conn-head)" : undefined}
            markerEnd={endArrow ? "url(#ef-conn-head)" : undefined}
          />
        </svg>
      </div>

      {/* Route */}
      <div className="space-y-2">
        <SectionLabel>Route</SectionLabel>
        <Segmented
          options={LINE_TYPES}
          value={lineType}
          onChange={(id) => set("lineType", id)}
          render={(id) => (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d={LINE_TYPES.find((t) => t.id === id)!.icon} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        />
      </div>

      {/* Arrowheads */}
      <div className="space-y-2">
        <SectionLabel>Arrowheads</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          {([
            { key: "startArrow", label: "Start", on: startArrow, d: "M9 7 L4 12 L9 17 M4 12 H20" },
            { key: "endArrow",   label: "End",   on: endArrow,   d: "M15 7 L20 12 L15 17 M4 12 H20" },
          ] as const).map((a) => (
            <button
              key={a.key}
              type="button"
              onClick={() => set(a.key, !a.on)}
              aria-pressed={a.on}
              className={cn(
                "h-10 rounded-[10px] border flex items-center justify-center gap-2 transition-colors duration-150",
                a.on
                  ? "bg-[#0D8EFF]/15 border-[#0D8EFF]/60 text-white"
                  : "bg-white/[0.04] border-white/10 text-[var(--wb-text-muted)] hover:text-white hover:bg-white/[0.06]"
              )}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d={a.d} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="text-xs font-medium">{a.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Line style */}
      <div className="space-y-2">
        <SectionLabel>Line Style</SectionLabel>
        <Segmented
          options={STROKE_STYLES}
          value={strokeStyle}
          onChange={(id) => set("strokeDashArray", STROKE_STYLES.find((s) => s.id === id)!.dashArray)}
          render={(id) => {
            const dash = STROKE_STYLES.find((s) => s.id === id)!.dashArray;
            return (
              <svg width="30" height="8" viewBox="0 0 30 8">
                <line x1="3" y1="4" x2="27" y2="4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray={dash ? dash.map((v) => v * 2).join(" ") : undefined} />
              </svg>
            );
          }}
        />
      </div>

      {/* Colour */}
      <div className="space-y-2">
        <SectionLabel>Color</SectionLabel>
        <div className="grid grid-cols-8 gap-1.5">
          {CONNECTOR_PALETTE.map((c) => {
            const active = strokeColor.toLowerCase() === c.value.toLowerCase();
            return (
              <button
                key={c.value}
                type="button"
                onClick={() => set("strokeColor", c.value)}
                aria-label={c.label}
                aria-pressed={active}
                title={c.label}
                className={cn(
                  "aspect-square rounded-[8px] border border-white/10 transition-all duration-150",
                  active ? "ring-2 ring-[#0D8EFF] ring-offset-2 ring-offset-[var(--wb-panel)] scale-105" : "hover:scale-110"
                )}
                style={{ backgroundColor: c.value }}
              />
            );
          })}
        </div>
      </div>

      {/* Width */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <SectionLabel>Width</SectionLabel>
          <span className="text-xs font-semibold tabular-nums text-[var(--wb-text-strong)]">{strokeWidth}px</span>
        </div>
        <input
          type="range"
          min={1}
          max={8}
          step={1}
          value={strokeWidth}
          onChange={(e) => set("strokeWidth", parseInt(e.target.value))}
          aria-label="Connector width"
          className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-white/10 accent-[#0D8EFF]"
        />
      </div>

      {/* Tip */}
      <div className="flex gap-2.5 p-3 rounded-[10px] bg-white/[0.03] border border-white/10">
        <MousePointerClick className="w-4 h-4 mt-0.5 shrink-0" style={{ color: EF.blue }} strokeWidth={2} />
        <p className="text-[11px] leading-relaxed text-[var(--wb-text-muted)]">
          Drag from a <span className="text-[var(--wb-text-strong)] font-medium">blue dot</span> on any shape or node to connect.
          Click a dot to add a connected copy. Drag a selected connector&apos;s end to re-attach it.
        </p>
      </div>
    </div>
  );
}
