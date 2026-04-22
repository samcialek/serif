/**
 * Sleek lever bar — wider, darker, with a gradient fill and glowing thumb.
 *
 * Shared across the LivingGraph edge-style presets (circuit / plasma /
 * lightning / classic). The `accent` prop lets each preset theme the fill
 * and thumb glow to match its edge palette.
 */

import { useCallback, useRef, useState } from 'react'
import type { ManipulableNode } from './_shared'
import { formatNodeValue, formatClock, rangeFor } from './_shared'

export interface SleekLeverBarProps {
  node: ManipulableNode
  current: number
  value: number
  onChange: (v: number) => void
  /** Accent color for the fill gradient + thumb glow. */
  accent?: string
  /** Brighter highlight for the fill's inner gradient stop (defaults to white). */
  highlight?: string
  disabled?: boolean
}

export function SleekLeverBar({
  node,
  current,
  value,
  onChange,
  accent = '#06b6d4',
  highlight = '#ffffff',
  disabled = false,
}: SleekLeverBarProps) {
  const railRef = useRef<HTMLDivElement | null>(null)
  const [dragging, setDragging] = useState(false)

  const range = rangeFor(node, current)
  const span = range.max - range.min
  const valueFrac = Math.max(0, Math.min(1, (value - range.min) / span))
  const currentFrac = Math.max(0, Math.min(1, (current - range.min) / span))
  const changed = Math.abs(value - current) > 1e-9

  const formatValue =
    node.id === 'bedtime' ? formatClock : (v: number) => formatNodeValue(v, node)

  const handlePointer = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (disabled || !railRef.current) return
      const rect = railRef.current.getBoundingClientRect()
      const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left))
      const frac = x / rect.width
      const raw = range.min + frac * span
      // Quantize to step.
      const quantized = Math.round(raw / node.step) * node.step
      const clamped = Math.max(range.min, Math.min(range.max, quantized))
      onChange(clamped)
    },
    [disabled, node.step, onChange, range.max, range.min, span],
  )

  return (
    <div className="w-full select-none">
      {/* Header: label + value */}
      <div className="flex items-baseline justify-between mb-1.5 px-0.5">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 truncate">
          {node.label}
        </div>
        <div
          className="text-[13px] font-bold tabular-nums"
          style={{ color: changed ? accent : '#e2e8f0', textShadow: changed ? `0 0 8px ${accent}80` : 'none' }}
        >
          {formatValue(value)}
        </div>
      </div>

      {/* Rail */}
      <div
        ref={railRef}
        className="relative h-2.5 touch-none rounded-full"
        onPointerDown={(e) => {
          if (disabled) return
          setDragging(true)
          ;(e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)
          handlePointer(e)
        }}
        onPointerMove={(e) => dragging && handlePointer(e)}
        onPointerUp={(e) => {
          setDragging(false)
          ;(e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId)
        }}
        style={{
          cursor: disabled ? 'default' : dragging ? 'grabbing' : 'grab',
          background:
            'linear-gradient(180deg, rgba(15,23,42,0.9) 0%, rgba(30,41,59,0.9) 100%)',
          boxShadow:
            'inset 0 1px 2px rgba(0,0,0,0.5), inset 0 -1px 0 rgba(255,255,255,0.04)',
          border: '1px solid rgba(51,65,85,0.6)',
        }}
      >
        {/* Current-value tick — subtle, so user sees their baseline */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-0.5 h-full rounded-full"
          style={{
            left: `calc(${currentFrac * 100}% - 1px)`,
            background: 'rgba(148,163,184,0.6)',
            pointerEvents: 'none',
          }}
        />

        {/* Fill — gradient from accent to brighter toward the thumb */}
        <div
          className="absolute top-0 bottom-0 left-0 rounded-l-full overflow-hidden"
          style={{
            width: `${valueFrac * 100}%`,
            background: `linear-gradient(90deg, ${accent}66 0%, ${accent}cc 60%, ${highlight}cc 100%)`,
            boxShadow: `0 0 12px ${accent}88`,
            transition: dragging ? 'none' : 'width 240ms cubic-bezier(0.4,0,0.2,1)',
          }}
        />

        {/* Thumb — small pill with outer glow */}
        <div
          className="absolute top-1/2 rounded-full"
          style={{
            left: `calc(${valueFrac * 100}% - 5px)`,
            transform: 'translateY(-50%)',
            width: 10,
            height: 14,
            background: `linear-gradient(180deg, ${highlight} 0%, ${accent} 100%)`,
            boxShadow: `0 0 8px ${accent}, 0 0 16px ${accent}80, 0 0 2px ${highlight}`,
            border: `1px solid ${highlight}`,
            transition: dragging ? 'none' : 'left 240ms cubic-bezier(0.4,0,0.2,1)',
          }}
        />
      </div>

      {/* Sublabel: current baseline value */}
      <div className="flex items-center justify-between mt-1 px-0.5">
        <div className="text-[9px] text-slate-500 tabular-nums">
          now {formatValue(current)}
        </div>
        {changed && (
          <div
            className="text-[9px] font-semibold tabular-nums"
            style={{ color: accent }}
          >
            {value > current ? '▲' : '▼'} {formatValue(Math.abs(value - current))}
          </div>
        )}
      </div>
    </div>
  )
}
