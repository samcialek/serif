/**
 * Integrations tab body. Groups the phased-roadmap catalog into two
 * sections (Phase 1 vs Phase 2) with a header per-phase, and swaps the
 * Open-Meteo card for the live weather widget.
 */

import { useMemo } from 'react'
import { integrationsByPhase } from '@/data/integrations/phasedIntegrations'
import { IntegrationCard } from './IntegrationCard'
import { WeatherWidget } from './WeatherWidget'

export function IntegrationsPanel() {
  const grouped = useMemo(() => integrationsByPhase(), [])

  const stats = useMemo(() => {
    let live = 0
    let p1 = 0
    let p2 = 0
    for (const phase of [1, 2] as const) {
      for (const item of grouped[phase]) {
        if (item.live) live += 1
        if (item.phase === 1) p1 += 1
        else p2 += 1
      }
    }
    return { live, p1, p2, total: p1 + p2 }
  }, [grouped])

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Data-moat roadmap</h3>
          <p className="text-xs text-slate-500 mt-0.5 max-w-2xl leading-relaxed">
            Ranked external sources that would expand the engine's testable-edge
            surface. Phase 1 is what we'd ship first; Phase 2 follows once Phase 1
            is instrumented. The live connection is Open-Meteo weather — the rest
            are demo placeholders.
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0 text-xs">
          <Stat label="Live" value={stats.live} tone="emerald" />
          <Stat label="Phase 1" value={stats.p1} tone="indigo" />
          <Stat label="Phase 2" value={stats.p2} tone="purple" />
        </div>
      </div>

      {/* Phase 1 */}
      <PhaseSection
        phase={1}
        title="Phase 1 · 0–3 months"
        subtitle="Clinical grounding, glucose dynamics, autonomic raw, environmental context."
      >
        {grouped[1].map((item) =>
          item.id === 'open_meteo' ? (
            <WeatherWidget key={item.id} className="h-full" />
          ) : (
            <IntegrationCard key={item.id} integration={item} />
          ),
        )}
      </PhaseSection>

      {/* Phase 2 */}
      <PhaseSection
        phase={2}
        title="Phase 2 · 3–6 months"
        subtitle="Cadenced biomarkers, ECG-grade wearables, genotype personalization, SDOH confounders."
      >
        {grouped[2].map((item) => (
          <IntegrationCard key={item.id} integration={item} />
        ))}
      </PhaseSection>
    </div>
  )
}

function PhaseSection({
  phase,
  title,
  subtitle,
  children,
}: {
  phase: 1 | 2
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="flex items-baseline gap-3 mb-3">
        <span
          className={
            phase === 1
              ? 'inline-flex items-center px-2 py-0.5 text-[10px] font-semibold rounded bg-indigo-100 text-indigo-700 uppercase tracking-wider'
              : 'inline-flex items-center px-2 py-0.5 text-[10px] font-semibold rounded bg-purple-100 text-purple-700 uppercase tracking-wider'
          }
        >
          Phase {phase}
        </span>
        <h4 className="text-sm font-semibold text-slate-800">{title}</h4>
      </div>
      <p className="text-xs text-slate-500 mb-3 ml-1">{subtitle}</p>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {children}
      </div>
    </section>
  )
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'emerald' | 'indigo' | 'purple'
}) {
  const toneCls =
    tone === 'emerald'
      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
      : tone === 'indigo'
        ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
        : 'bg-purple-50 border-purple-200 text-purple-700'
  return (
    <div className={`px-2.5 py-1 rounded-md border ${toneCls}`}>
      <p className="text-[10px] uppercase tracking-wider leading-none opacity-80">{label}</p>
      <p className="text-sm font-semibold tabular-nums leading-tight">{value}</p>
    </div>
  )
}
