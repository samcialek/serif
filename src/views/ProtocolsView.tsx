import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { AlertCircle, Loader2, Users } from 'lucide-react'
import { PageLayout } from '@/components/layout'
import { Card } from '@/components/common'
import { OptimalSchedule } from '@/components/portal'
import { useParticipant } from '@/hooks/useParticipant'
import { useActiveParticipant } from '@/hooks/useActiveParticipant'
import { usePortalStore } from '@/stores/portalStore'
import { derivedWakeTime, pickOptimalSchedule, OBJECTIVE_ORON } from '@/utils/twinSem'
import type { RegimeKey } from '@/data/portal/types'

const DAY_OF_WEEK = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]

export function ProtocolsView() {
  const activePid = usePortalStore((s) => s.activePid)
  const { participant, isLoading, error } = useParticipant()
  const { displayName } = useActiveParticipant()

  const today = useMemo(() => new Date(), [])

  const twin = useMemo(() => {
    if (!participant) return null
    const result = pickOptimalSchedule(participant, OBJECTIVE_ORON)
    const wakeTime = derivedWakeTime(participant)
    const regimes = participant.regime_activations ?? {}
    const activeRegimes = (Object.entries(regimes) as Array<[RegimeKey, number]>)
      .filter(([, v]) => v >= 0.5)
      .sort((a, b) => b[1] - a[1])
      .map(([key, activation]) => ({ key, activation }))
    const current = {
      bedtime: participant.current_values?.bedtime ?? 22.5,
      sleep_duration: participant.current_values?.sleep_duration ?? 8,
      training_load: participant.current_values?.training_load ?? 0,
      running_volume: participant.current_values?.running_volume ?? 0,
    }
    return { result, wakeTime, activeRegimes, current }
  }, [participant])

  if (activePid == null) {
    return (
      <PageLayout
        title="Today's plan"
        subtitle="Twin-SEM counterfactual: candidate schedules scored against the member's edge posteriors + regime state"
      >
        <Card padding="md" className="flex flex-col items-center text-center py-12">
          <div className="w-14 h-14 rounded-2xl bg-primary-50 border border-primary-100 flex items-center justify-center mb-3">
            <Users className="w-6 h-6 text-primary-500" />
          </div>
          <h3 className="text-base font-semibold text-slate-700 mb-1">Select a member</h3>
          <p className="text-sm text-slate-500 max-w-sm">
            Pick a member from the Insights tab to see their daily schedule.
          </p>
        </Card>
      </PageLayout>
    )
  }

  if (isLoading) {
    return (
      <PageLayout title={`${displayName} — today's plan`}>
        <Card padding="md" className="flex flex-col items-center text-slate-500 py-12">
          <Loader2 className="w-5 h-5 animate-spin mb-2" />
          <span className="text-sm">Loading {displayName}…</span>
        </Card>
      </PageLayout>
    )
  }

  if (error) {
    return (
      <PageLayout title={`${displayName} — today's plan`}>
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

  if (!participant || !twin) return null

  const dateLabel = today.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  return (
    <PageLayout
      title={`${displayName} — today's plan`}
      subtitle="Twin-SEM picks the best daily schedule by scoring candidates against the member's causal edges, regime state, and current loads"
    >
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <Card padding="md" className="rounded-xl">
          <OptimalSchedule
            result={twin.result}
            dateLabel={dateLabel}
            dayOfWeek={DAY_OF_WEEK[today.getDay()]}
            activeRegimes={twin.activeRegimes}
            wakeTime={twin.wakeTime}
            current={twin.current}
          />
        </Card>
      </motion.div>
    </PageLayout>
  )
}

export default ProtocolsView
