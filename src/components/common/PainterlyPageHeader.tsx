/**
 * PainterlyPageHeader — unified page header for every tab.
 *
 * Replaces the brutalist black-bar PageLayout header with the painterly
 * Twin aesthetic: a soft cream surface, hand-drawn-feeling persona
 * portrait on the left (PersonaPortrait with cleanBackground), a tight
 * member-name + subtitle stack, and an actions row on the right that
 * holds the ScopeBar + tab-specific controls.
 *
 * Usage: pass `title="" actions={null}` to the underlying PageLayout
 * (so it doesn't render its own header) and drop this component as the
 * first child.
 */

import { useActiveParticipant } from '@/hooks/useActiveParticipant'
import { PersonaPortrait } from '@/components/common/PersonaPortrait'
import { ScopeBar } from '@/components/common/ScopeBar'
import { cn } from '@/utils/classNames'
import {
  BG_CARD,
  LINE,
  TEXT_INK,
  TEXT_MUTED,
} from '@/styles/painterlyTokens'

export interface PainterlyPageHeaderProps {
  /** Tab subtitle — short, descriptive sentence under the member name. */
  subtitle?: string
  /** Tab-specific controls on the right of the header (e.g. solver
   *  banner, dataMode toggle). Rendered AFTER ScopeBar. */
  actions?: React.ReactNode
  /** When true, omit the horizon segment of ScopeBar (labs, devices). */
  hideHorizon?: boolean
  /** When true, omit the regime segment too — useful when the tab is
   *  intrinsically scoped (rare). */
  hideRegime?: boolean
  /** Optional override for the title — defaults to the active member's
   *  display name. Set this when the tab isn't member-scoped. */
  title?: React.ReactNode
  /** Stat chips shown alongside the portrait. Pass an empty array to
   *  omit. Defaults to HRV / RHR / Deep / REM when omitted. */
  stats?: Array<{ label: string; value: number; unit?: string }>
  /** When true (default), header sticks to the top of the scrollable
   *  area on long pages. Twin's full-viewport canvas should pass false
   *  — the canvas owns the scroll/zoom region and the sticky shadow
   *  overlaps in-canvas tooltips. */
  sticky?: boolean
  className?: string
}

/** Default stat builder — surfaces the four wearable headlines if the
 *  active persona has them. */
function defaultStats(personaMetrics?: {
  hrv?: number
  restingHr?: number
  deepSleepMin?: number
  remSleepMin?: number
}): Array<{ label: string; value: number; unit?: string }> {
  if (!personaMetrics) return []
  const stats: Array<{ label: string; value: number; unit?: string }> = []
  if (personaMetrics.hrv) {
    stats.push({ label: 'HRV', value: personaMetrics.hrv, unit: 'ms' })
  }
  if (personaMetrics.restingHr) {
    stats.push({ label: 'RHR', value: personaMetrics.restingHr, unit: 'bpm' })
  }
  if (personaMetrics.deepSleepMin) {
    stats.push({ label: 'Deep', value: personaMetrics.deepSleepMin, unit: 'min' })
  }
  if (personaMetrics.remSleepMin) {
    stats.push({ label: 'REM', value: personaMetrics.remSleepMin, unit: 'min' })
  }
  return stats
}

export function PainterlyPageHeader({
  subtitle,
  actions,
  hideHorizon = false,
  hideRegime = false,
  title,
  stats,
  sticky = true,
  className,
}: PainterlyPageHeaderProps) {
  const { pid, displayName, persona, cohort } = useActiveParticipant()
  const resolvedStats = stats ?? defaultStats(persona?.currentMetrics)
  const resolvedTitle = title ?? displayName
  return (
    <div
      className={cn(
        'mb-6 px-5 py-4 rounded-2xl flex items-start gap-5 flex-wrap',
        sticky && 'sticky top-3 z-30 shadow-sm',
        className,
      )}
      style={{
        background: BG_CARD,
        border: `1px solid ${LINE}`,
      }}
    >
      {/* Member portrait + identity */}
      <div className="flex items-start gap-4 flex-1 min-w-0">
        {pid != null && (
          <PersonaPortrait
            persona={persona}
            displayName={displayName}
            cohort={cohort}
            subtitle={subtitle}
            size={108}
            cleanBackground
            stats={resolvedStats}
          />
        )}
        {pid == null && (
          <div className="flex-1">
            <h1
              className="text-2xl font-light tracking-tight"
              style={{ color: TEXT_INK, fontFamily: 'Inter, sans-serif' }}
            >
              {resolvedTitle}
            </h1>
            {subtitle && (
              <p
                className="mt-1 text-sm"
                style={{ color: TEXT_MUTED, fontFamily: 'Inter, sans-serif' }}
              >
                {subtitle}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Right-side controls — ScopeBar always first, then tab actions */}
      <div className="flex items-center gap-3 flex-wrap ml-auto">
        <ScopeBar
          showHorizon={!hideHorizon}
          showRegime={!hideRegime}
        />
        {actions}
      </div>
    </div>
  )
}

export default PainterlyPageHeader
