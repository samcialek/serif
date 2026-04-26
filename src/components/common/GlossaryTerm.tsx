/**
 * GlossaryTerm — inline acronym renderer with a hoverable (i) icon.
 *
 * Usage:
 *   <GlossaryTerm termId="hrv_daily" />              → "HRV ⓘ"
 *   <GlossaryTerm termId="hscrp" display="hs-CRP" /> → "hs-CRP ⓘ"
 *
 * The (i) icon only renders when the termId resolves to a glossary
 * entry — unknown ids fall through to plain text. Hover (or focus) the
 * icon to open a structured popover with Full name / What it is /
 * Typical range. The popover mounts to document.body via createPortal
 * so it escapes any clipping ancestors (cards with overflow-hidden,
 * scroll containers, etc).
 */

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { getGlossaryEntry } from '@/data/glossary'

interface GlossaryTermProps {
  /** Canonical id — looked up against the glossary. */
  termId: string
  /** Override display text. Defaults to entry.term, or termId if no entry. */
  display?: ReactNode
  /** Shown above the (i) icon for screen readers + hover preview. */
  className?: string
}

export function GlossaryTerm({
  termId,
  display,
  className,
}: GlossaryTermProps) {
  const entry = getGlossaryEntry(termId)
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState({ top: 0, left: 0 })
  const triggerRef = useRef<HTMLSpanElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const showTimer = useRef<ReturnType<typeof setTimeout>>()

  const computePosition = useCallback(() => {
    if (!triggerRef.current || !popoverRef.current) return
    const trig = triggerRef.current.getBoundingClientRect()
    const pop = popoverRef.current.getBoundingClientRect()
    const gap = 8
    const padding = 8
    let top = trig.top - pop.height - gap + window.scrollY
    let left = trig.left + trig.width / 2 - pop.width / 2 + window.scrollX
    // Keep within viewport horizontally
    left = Math.max(
      padding,
      Math.min(left, window.innerWidth - pop.width - padding),
    )
    // Flip below if it'd go above viewport
    if (top < window.scrollY + padding) {
      top = trig.bottom + gap + window.scrollY
    }
    setCoords({ top, left })
  }, [])

  const showSoon = useCallback(() => {
    if (showTimer.current) clearTimeout(showTimer.current)
    showTimer.current = setTimeout(() => setOpen(true), 120)
  }, [])

  const hide = useCallback(() => {
    if (showTimer.current) clearTimeout(showTimer.current)
    setOpen(false)
  }, [])

  useEffect(() => {
    if (open) {
      requestAnimationFrame(computePosition)
    }
  }, [open, computePosition])

  useEffect(() => {
    return () => {
      if (showTimer.current) clearTimeout(showTimer.current)
    }
  }, [])

  // No entry → just render the display text (or termId fallback).
  if (!entry) {
    return <span className={className}>{display ?? termId}</span>
  }

  const labelText = display ?? entry.term

  return (
    <span className={className} style={{ whiteSpace: 'nowrap' }}>
      {labelText}
      <span
        ref={triggerRef}
        tabIndex={0}
        role="button"
        aria-label={`What is ${entry.term}? ${entry.fullName}`}
        onMouseEnter={showSoon}
        onMouseLeave={hide}
        onFocus={() => setOpen(true)}
        onBlur={hide}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 13,
          height: 13,
          borderRadius: '50%',
          border: '1px solid #cbd5e1',
          color: open ? '#5C7B6B' : '#a8a29e',
          borderColor: open ? '#7C9F8B' : '#cbd5e1',
          fontSize: 9.5,
          fontWeight: 700,
          fontStyle: 'italic',
          fontFamily: 'Times New Roman, serif',
          marginLeft: 4,
          verticalAlign: '1px',
          cursor: 'help',
          lineHeight: 1,
          transition: 'color 120ms ease, border-color 120ms ease',
          userSelect: 'none',
        }}
      >
        i
      </span>
      {open &&
        createPortal(
          <div
            ref={popoverRef}
            role="tooltip"
            style={{
              position: 'absolute',
              top: coords.top,
              left: coords.left,
              background: '#fff',
              border: '1px solid #e7e5e4',
              borderRadius: 10,
              padding: '12px 14px',
              width: 280,
              boxShadow: '0 6px 20px rgba(28, 25, 23, 0.10)',
              fontFamily: 'Inter, sans-serif',
              fontSize: 12.5,
              lineHeight: 1.5,
              color: '#44403c',
              zIndex: 1000,
              pointerEvents: 'auto',
              whiteSpace: 'normal',
              textAlign: 'left',
              fontWeight: 400,
              fontStyle: 'normal',
              letterSpacing: 0,
            }}
            onMouseEnter={showSoon}
            onMouseLeave={hide}
          >
            <Row label="Full name" value={entry.fullName} />
            <Row label="What it is" value={entry.definition} />
            {entry.typical && <Row label="Typical" value={entry.typical} />}
          </div>,
          document.body,
        )}
    </span>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
      <span
        style={{
          color: '#a8a29e',
          width: 64,
          flexShrink: 0,
          fontSize: 10.5,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          paddingTop: 1,
        }}
      >
        {label}
      </span>
      <span style={{ color: '#44403c', flex: 1 }}>{value}</span>
    </div>
  )
}

export default GlossaryTerm
