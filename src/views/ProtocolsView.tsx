import { useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  AlertCircle,
  Loader2,
  Moon,
  Sun,
  Sunrise,
  Sparkles,
  Users,
} from 'lucide-react'
import { PageLayout } from '@/components/layout'
import { Card } from '@/components/common'
import { ProtocolCard } from '@/components/portal'
import { useParticipant } from '@/hooks/useParticipant'
import { useActiveParticipant } from '@/hooks/useActiveParticipant'
import { usePortalStore } from '@/stores/portalStore'
import type { Protocol } from '@/data/portal/types'

type TimeOfDay = 'morning' | 'afternoon' | 'evening'

// Action → time-of-day bucket. Driven by when the user would actually
// perform the action, not when the data is measured. Any new action the
// engine emits falls into Afternoon by default until we have a reason
// to place it elsewhere.
const ACTION_TIME_OF_DAY: Record<string, TimeOfDay> = {
  wake_time: 'morning',
  dietary_protein: 'morning',
  workout_time: 'afternoon',
  training_load: 'afternoon',
  training_volume: 'afternoon',
  running_volume: 'afternoon',
  zone2_volume: 'afternoon',
  steps: 'afternoon',
  active_energy: 'afternoon',
  dietary_energy: 'afternoon',
  bedtime: 'evening',
  sleep_duration: 'evening',
}

const TOD_META: Record<
  TimeOfDay,
  { label: string; icon: React.ElementType; accent: string; description: string }
> = {
  morning: {
    label: 'Morning',
    icon: Sunrise,
    accent: '#f59e0b',
    description: 'How to start the day',
  },
  afternoon: {
    label: 'Afternoon',
    icon: Sun,
    accent: '#5ba8d4',
    description: 'Training and daily activity',
  },
  evening: {
    label: 'Evening',
    icon: Moon,
    accent: '#b8aadd',
    description: 'Wind-down and sleep',
  },
}

const TOD_ORDER: TimeOfDay[] = ['morning', 'afternoon', 'evening']

function groupByTimeOfDay(protocols: Protocol[]): Record<TimeOfDay, Protocol[]> {
  const groups: Record<TimeOfDay, Protocol[]> = {
    morning: [],
    afternoon: [],
    evening: [],
  }
  for (const p of protocols) {
    const tod = ACTION_TIME_OF_DAY[p.action] ?? 'afternoon'
    groups[tod].push(p)
  }
  for (const tod of TOD_ORDER) {
    groups[tod].sort((a, b) => a.option_index - b.option_index)
  }
  return groups
}

export function ProtocolsView() {
  const activePid = usePortalStore((s) => s.activePid)
  const { participant, isLoading, error } = useParticipant()
  const { displayName } = useActiveParticipant()

  const grouped = useMemo(
    () => groupByTimeOfDay(participant?.protocols ?? []),
    [participant],
  )

  if (activePid == null) {
    return (
      <PageLayout title="Protocols" subtitle="Action plans synthesized from Bayesian insights">
        <Card padding="md" className="flex flex-col items-center text-center py-12">
          <div className="w-14 h-14 rounded-2xl bg-primary-50 border border-primary-100 flex items-center justify-center mb-3">
            <Users className="w-6 h-6 text-primary-500" />
          </div>
          <h3 className="text-base font-semibold text-slate-700 mb-1">
            Select a participant
          </h3>
          <p className="text-sm text-slate-500 max-w-sm">
            Pick a pid from the Insights tab to see their synthesized protocols.
          </p>
        </Card>
      </PageLayout>
    )
  }

  if (isLoading) {
    return (
      <PageLayout title={`${displayName} — Protocols`}>
        <Card padding="md" className="flex flex-col items-center text-slate-500 py-12">
          <Loader2 className="w-5 h-5 animate-spin mb-2" />
          <span className="text-sm">Loading {displayName}…</span>
        </Card>
      </PageLayout>
    )
  }

  if (error) {
    return (
      <PageLayout title={`${displayName} — Protocols`}>
        <Card padding="md" className="flex flex-col items-center text-center py-12">
          <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center mb-3">
            <AlertCircle className="w-6 h-6 text-rose-500" />
          </div>
          <h3 className="text-base font-semibold text-slate-700 mb-1">Failed to load</h3>
          <p className="text-sm text-slate-500 font-mono">{error.message}</p>
        </Card>
      </PageLayout>
    )
  }

  if (!participant) return null

  const protocolCount = participant.protocols.length

  return (
    <PageLayout
      title={`${displayName} — Protocols`}
      subtitle={`${protocolCount} action plan${protocolCount === 1 ? '' : 's'} organized by time of day`}
    >
      <div className="mb-6 p-3 bg-primary-50 border border-primary-100 rounded-lg flex items-start gap-2">
        <Sparkles className="w-4 h-4 text-primary-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-slate-600">
          Synthesized from {displayName}&apos;s Bayesian posterior. Switch the participant from
          the Insights tab to see someone else.
        </p>
      </div>

      {protocolCount === 0 ? (
        <Card padding="md" className="flex flex-col items-center text-center py-12">
          <h3 className="text-base font-semibold text-slate-700 mb-1">
            No protocols yet
          </h3>
          <p className="text-sm text-slate-500 max-w-md">
            The engine hasn&apos;t synthesized any action plans for this participant
            yet — either no recommendations have cleared the gate, or the required
            evidence hasn&apos;t accumulated.
          </p>
        </Card>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="space-y-6"
        >
          {TOD_ORDER.map((tod) => (
            <TimeOfDaySection key={tod} tod={tod} protocols={grouped[tod]} />
          ))}
        </motion.div>
      )}
    </PageLayout>
  )
}

function TimeOfDaySection({ tod, protocols }: { tod: TimeOfDay; protocols: Protocol[] }) {
  const meta = TOD_META[tod]
  const Icon = meta.icon
  return (
    <Card padding="none" className="overflow-hidden">
      <div
        className="px-5 py-3 border-b flex items-center gap-3"
        style={{ backgroundColor: meta.accent + '12', borderColor: meta.accent + '30' }}
      >
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: meta.accent + '22' }}
        >
          <Icon className="w-4 h-4" style={{ color: meta.accent }} />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-slate-800">{meta.label}</h3>
          <p className="text-xs text-slate-500">{meta.description}</p>
        </div>
        <span className="text-xs text-slate-400 tabular-nums">
          {protocols.length} plan{protocols.length === 1 ? '' : 's'}
        </span>
      </div>
      <div className="p-4">
        {protocols.length === 0 ? (
          <p className="text-xs text-slate-400 italic text-center py-4">
            No {meta.label.toLowerCase()} protocols for this participant.
          </p>
        ) : (
          <div
            className={
              protocols.length > 1 ? 'grid md:grid-cols-2 gap-3' : 'space-y-3'
            }
          >
            {protocols.map((p) => (
              <ProtocolCard key={p.protocol_id} protocol={p} />
            ))}
          </div>
        )}
      </div>
    </Card>
  )
}

export default ProtocolsView
