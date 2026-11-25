// EasyFlow design-system tokens used by canvas-drawn UI (connectors, anchors, minimap) — canvas code can't read CSS variables, so the values live here.

export const EF = {
  // Surfaces
  background:    "#191919",
  background200: "#1C1C1C",
  card:          "#2B2B2E",

  // Text
  foreground:    "#FBFBFB",
  muted:         "#A6A6A9",
  gray:          "#6E6E6E",

  // Brand accents
  blue:          "#0D8EFF",
  yellow:        "#FFC53D",
  green:         "#51FF00",
  pink:          "#FF00C8",
  destructive:   "#F26D5B",

  // Base radius (--radius)
  radius:        10,
} as const;

// ─── Themes ───────────────────────────────────────────────────────────────────

export type ResolvedTheme = "dark" | "light";

/** Default stroke and text colour for new drawings: white on dark, near-black on light. */
export const INK: Record<ResolvedTheme, string> = { dark: "#ffffff", light: "#1e1e1e" };

/** Board surface behind canvas-drawn handles. */
export const SURFACE: Record<ResolvedTheme, string> = { dark: "#191919", light: "#FFFFFF" };

/** `EF.blue` at a given alpha — for glows, fills and halos. */
export const blueAlpha = (alpha: number) => `rgba(13, 142, 255, ${alpha})`;

/** Connector colours offered in the properties panel, in display order. */
export const CONNECTOR_PALETTE = [
  { value: EF.muted,       label: "Muted" },
  { value: EF.foreground,  label: "White" },
  { value: EF.gray,        label: "Gray" },
  { value: EF.blue,        label: "Blue" },
  { value: EF.green,       label: "Green" },
  { value: EF.yellow,      label: "Yellow" },
  { value: EF.pink,        label: "Pink" },
  { value: EF.destructive, label: "Red" },
] as const;

/**
 * Default connector colour. Muted gray keeps lines quieter than the shapes
 * and cards they join, so brand-coloured connectors stand out when used.
 */
export const CONNECTOR_DEFAULT_COLOR = EF.muted;
