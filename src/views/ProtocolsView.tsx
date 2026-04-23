import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { AlertCircle, Loader2, Users } from 'lucide-react'
import { PageLayout } from '@/components/layout'
import { Card, MemberAvatar } from '@/components/common'
import {
  OptimalSchedule,
  ProtocolContextVariantToggle,
  useContextVariants,
} from '@/components/portal'
import { useParticipant } from '@/hooks/useParticipant'
import { useActiveParticipant } from '@/hooks/useActiveParticipant'
import { usePortalStore } from '@/stores/portalStore'
import {
  derivedWakeTime,
  pickNeutralBaseline,
  pickOptimalSchedule,
  OBJECTIVE_ORON,
} from '@/utils/twinSem'
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
  const { displayName, persona } = useActiveParticipant()
  const [variants, setVariants] = useContextVariants()

  const titleAccessory = (
    <MemberAvatar persona={persona} displayName={displayName} size="lg" />
  )

  const today = useMemo(() => new Date(), [])

  const twin = useMemo(() => {
    if (!participant) return null
    const result = pickOptimalSchedule(participant, OBJECTIVE_ORON)
    const neutralBaseline = pickNeutralBaseline(participant, OBJECTIVE_ORON)
    const wakeTime = derivedWakeTime(participant)
    const regimes = participant.regime_activations ?? {}
    const activeRegimes = (Object.entries(regimes) as Array<[RegimeKey, number]>)
      .filter(([, v]) => v >= 0.3)
      .sort((a, b) => b[1] - a[1])
      .map(([key, activation]) => ({ key, activation }))
    return { result, neutralBaseline, wakeTime, activeRegimes }
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
      <PageLayout title={`${displayName} — today's plan`} titleAccessory={titleAccessory}>
        <Card padding="md" className="flex flex-col items-center text-slate-500 py-12">
          <Loader2 className="w-5 h-5 animate-spin mb-2" />
          <span className="text-sm">Loading {displayName}…</span>
        </Card>
      </PageLayout>
    )
  }

  if (error) {
    return (
      <PageLayout title={`${displayName} — today's plan`} titleAccessory={titleAccessory}>
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

  const actions = (
    <ProtocolContextVariantToggle
      variants={variants}
      onChange={setVariants}
    />
  )

  return (
    <PageLayout
      title={`${displayName} — today's plan`}
      titleAccessory={titleAccessory}
      actions={actions}
      subtitle="Today's schedule, chosen for this member's current loads and regime state."
    >
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <Card padding="md" className="rounded-xl">
          <OptimalSchedule
            participant={participant}
            result={twin.result}
            neutralBaseline={twin.neutralBaseline}
            dateLabel={dateLabel}
            dayOfWeek={DAY_OF_WEEK[today.getDay()]}
            activeRegimes={twin.activeRegimes}
            wakeTime={twin.wakeTime}
            chipVariant={variants.chip}
            auditPlacement={variants.audit}
          />
        </Card>
      </motion.div>
    </PageLayout>
  )
}

export default ProtocolsView
