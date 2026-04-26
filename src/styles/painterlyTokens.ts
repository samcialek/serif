/**
 * Painterly design tokens — the palette born in the Twin canvas, now
 * promoted to the whole app so every tab reads as part of the same
 * hand-bound binder rather than a clinical dashboard pasted next to a
 * painterly demo.
 *
 * Three functional color families:
 *
 *   BG*     — surface colors (page bg, card bg, track bg)
 *   TONE*   — semantic tone (benefit / harm / neutral) for stroke + text
 *   LINE*   — hairline borders + grid lines
 *
 * Import this file in every card/section you style so color literals
 * live in one place. When you want to refresh the system (e.g. darker
 * cream for winter), only this file needs editing.
 */

// ─── Surfaces ──────────────────────────────────────────────────────
export const BG_CANVAS = '#fefbf3' // primary page/canvas surface
export const BG_CARD = '#ffffff'
export const BG_CARD_WARM = '#faf6ec' // cream card interior (used in detail panels)
export const BG_TRACK = '#f0e9d8' // inert slider tracks, deep chip bg
export const BG_TRACK_LIGHT = '#f5efe2' // thinner neutral fill
export const BG_TRACK_COOL = '#e3edf3' // sleep-widget track blue tint

// ─── Hairlines ─────────────────────────────────────────────────────
export const LINE = '#f0e9d8' // universal warm-stone border
export const LINE_MUTED = '#e7e5e4' // secondary border (lighter, more neutral)

// ─── Semantic tone — stroke ────────────────────────────────────────
// Strokes are baby-blue / terracotta / warm-stone. Saturated versions
// of the text tones below.
export const TONE_STROKE = {
  benefit: '#89CFF0',
  harm: '#C76B4D',
  neutral: '#B8AB94',
} as const

// ─── Semantic tone — text ──────────────────────────────────────────
// Darker, more legible tones for text. Match these to card titles /
// numeric headlines in their respective tone.
export const TONE_TEXT = {
  benefit: '#4A8AB5', // deeper baby blue
  harm: '#8B4830', // deeper terracotta
  neutral: '#847764', // deeper warm stone
} as const

// ─── Confidence / provenance ───────────────────────────────────────
// Four-state system used by ProvenanceBadge. Sage = confident/fitted;
// gold = partial; terracotta = wide band / low confidence; stone (used
// with dashed ring) = literature-only / no per-person posterior.
export const CONF_COLORS = {
  high: '#7C9F8B', // sage
  med: '#D4A857', // serif gold
  low: '#C76B4D', // terracotta
  lit: '#9CA3AF', // stone (dashed ring treatment, see ProvenanceBadge)
} as const

// ─── Accent tones ─────────────────────────────────────────────────
// Used sparingly for interactive call-outs (Save button, solver banner).
export const ACCENT_SAGE = '#7C9F8B'
export const ACCENT_GOLD = '#D4A857'
export const ACCENT_TERRACOTTA = '#C76B4D'
export const ACCENT_BABY_BLUE = '#89CFF0'

// ─── Text colors ──────────────────────────────────────────────────
export const TEXT_INK = '#1c1917'
export const TEXT_BODY = '#44403c'
export const TEXT_MUTED = '#78716c'
export const TEXT_FAINT = '#a8a29e'
export const TEXT_WHISPER = '#d6d3d1'

// ─── Radii ────────────────────────────────────────────────────────
export const RADIUS_PILL = 999
export const RADIUS_PANEL = 28
export const RADIUS_CARD = 14
export const RADIUS_CHIT = 22
