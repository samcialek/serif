/**
 * Single integration card. Wiring-only for the dummy entries — the
 * "Connect" button flips a local-pending state so the card looks like
 * it's reaching out, then lands in "coming soon".
 *
 * For the one live entry (Open-Meteo), the parent swaps the body with
 * <WeatherWidget/>, so this file doesn't know anything about it.
 */

import { useState } from 'react'
import {
  Activity,
  CloudSun,
  Database,
  Dna,
  FlaskConical,
  HeartPulse,
  MapPin,
  Stethoscope,
  Watch,
  Wind,
  CheckCircle2,
  Loader2,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/utils/classNames'
import type { PhasedIntegration } from '@/data/integrations/phasedIntegrations'

const ICON_MAP: Record<string, LucideIcon> = {
  Activity,
  CloudSun,
  Database,
  Dna,
  FlaskConical,
  HeartPulse,
  MapPin,
  Stethoscope,
  Watch,
  Wind,
}

const ACCENT: Record<string, { border: string; iconBg: string; iconText: string; chipBg: string; chipText: string; btn: string }> = {
  sky: {
    border: 'border-sky-300',
    iconBg: 'bg-sky-50',
    iconText: 'text-sky-600',
    chipBg: 'bg-sky-50 border-sky-200',
    chipText: 'text-sky-700',
    btn: 'bg-sky-600 hover:bg-sky-700',
  },
  indigo: {
    border: 'border-indigo-200',
    iconBg: 'bg-indigo-50',
    iconText: 'text-indigo-600',
    chipBg: 'bg-indigo-50 border-indigo-200',
    chipText: 'text-indigo-700',
    btn: 'bg-indigo-600 hover:bg-indigo-700',
  },
  rose: {
    border: 'border-rose-200',
    iconBg: 'bg-rose-50',
    iconText: 'text-rose-600',
    chipBg: 'bg-rose-50 border-rose-200',
    chipText: 'text-rose-700',
    btn: 'bg-rose-600 hover:bg-rose-700',
  },
  red: {
    border: 'border-red-200',
    iconBg: 'bg-red-50',
    iconText: 'text-red-600',
    chipBg: 'bg-red-50 border-red-200',
    chipText: 'text-red-700',
    btn: 'bg-red-600 hover:bg-red-700',
  },
  slate: {
    border: 'border-slate-200',
    iconBg: 'bg-slate-50',
    iconText: 'text-slate-600',
    chipBg: 'bg-slate-50 border-slate-200',
    chipText: 'text-slate-700',
    btn: 'bg-slate-600 hover:bg-slate-700',
  },
  emerald: {
    border: 'border-emerald-200',
    iconBg: 'bg-emerald-50',
    iconText: 'text-emerald-600',
    chipBg: 'bg-emerald-50 border-emerald-200',
    chipText: 'text-emerald-700',
    btn: 'bg-emerald-600 hover:bg-emerald-700',
  },
  amber: {
    border: 'border-amber-200',
    iconBg: 'bg-amber-50',
    iconText: 'text-amber-600',
    chipBg: 'bg-amber-50 border-amber-200',
    chipText: 'text-amber-700',
    btn: 'bg-amber-600 hover:bg-amber-700',
  },
  purple: {
    border: 'border-purple-200',
    iconBg: 'bg-purple-50',
    iconText: 'text-purple-600',
    chipBg: 'bg-purple-50 border-purple-200',
    chipText: 'text-purple-700',
    btn: 'bg-purple-600 hover:bg-purple-700',
  },
  fuchsia: {
    border: 'border-fuchsia-200',
    iconBg: 'bg-fuchsia-50',
    iconText: 'text-fuchsia-600',
    chipBg: 'bg-fuchsia-50 border-fuchsia-200',
    chipText: 'text-fuchsia-700',
    btn: 'bg-fuchsia-600 hover:bg-fuchsia-700',
  },
  teal: {
    border: 'border-teal-200',
    iconBg: 'bg-teal-50',
    iconText: 'text-teal-600',
    chipBg: 'bg-teal-50 border-teal-200',
    chipText: 'text-teal-700',
    btn: 'bg-teal-600 hover:bg-teal-700',
  },
}

interface IntegrationCardProps {
  integration: PhasedIntegration
  className?: string
}

export function IntegrationCard({ integration, className }: IntegrationCardProps) {
  const Icon = ICON_MAP[integration.icon] ?? Database
  const a = ACCENT[integration.accent] ?? ACCENT.slate
  const [pending, setPending] = useState(false)
  const [connected, setConnected] = useState(integration.status === 'connected')

  const handleConnect = () => {
    if (connected || pending) return
    setPending(true)
    // Dummy flow: simulate reach-out, then leave the button in a
    // "Requested" state so the demo makes it clear this is wiring-only.
    window.setTimeout(() => {
      setPending(false)
      setConnected(true)
    }, 1100)
  }

  return (
    <div
      className={cn(
        'rounded-lg border bg-white p-4 flex flex-col gap-3 transition-shadow hover:shadow-sm',
        connected ? a.border + ' border-2' : 'border-slate-200',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0', a.iconBg)}>
          <Icon className={cn('w-5 h-5', a.iconText)} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-slate-800 text-sm truncate">{integration.name}</p>
            <span
              className={cn(
                'inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium border rounded-full',
                connected ? a.chipBg : 'bg-slate-50 border-slate-200',
                connected ? a.chipText : 'text-slate-500',
              )}
            >
              {connected && <CheckCircle2 className="w-3 h-3" />}
              {connected ? 'Connected' : integration.status === 'coming_soon' ? 'Coming soon' : 'Available'}
            </span>
            <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider ml-auto">
              Phase {integration.phase}
            </span>
          </div>
          <p className="text-xs text-slate-500 truncate">{integration.vendor}</p>
        </div>
      </div>

      <p className="text-xs text-slate-600 leading-snug">{integration.description}</p>

      <div>
        <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Why it matters</p>
        <p className="text-[11px] text-slate-600 leading-snug">{integration.whyItMatters}</p>
      </div>

      {integration.unlockEdges.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">
            Edges unlocked ({integration.unlockEdges.length})
          </p>
          <div className="flex flex-wrap gap-1">
            {integration.unlockEdges.map((e) => (
              <span
                key={e}
                className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-100 text-slate-600 rounded"
              >
                {e}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-1 mt-auto">
        <div className="text-[11px] text-slate-400">
          Rank #{integration.rank} · score {integration.score.toFixed(1)}/10
        </div>
        <button
          type="button"
          onClick={handleConnect}
          disabled={connected || pending}
          className={cn(
            'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md text-white transition-colors',
            connected ? 'bg-emerald-600' : a.btn,
            (connected || pending) && 'opacity-90 cursor-default',
          )}
        >
          {pending && <Loader2 className="w-3 h-3 animate-spin" />}
          {connected && <CheckCircle2 className="w-3 h-3" />}
          {connected ? 'Connected' : pending ? 'Requesting…' : 'Connect'}
        </button>
      </div>
    </div>
  )
}
