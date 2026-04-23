import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { AlertCircle, Loader2, Users } from 'lucide-react'
import { PageLayout } from '@/components/layout'
import { Card, MemberAvatar } from '@/components/common'
import {
  CounterfactualSliders,
  OptimalSchedule,
  ProtocolContextVariantToggle,
  useContextVariants,
} from '@/components/portal'
import type { RegimeOverrides } from '@/components/portal'
import { useParticipant } from '@/hooks/useParticipant'
import { useActiveParticipant } from '@/hooks/useActiveParticipant'
import { usePortalStore } from '@/stores/portalStore'
import {
  derivedWakeTime,
  pickNeutralBaseline,
  pickOptimalSchedule,
  pickYesterdayProtocol,
  OBJECTIVE_ORON,
} from '@/utils/twinSem'
import type { ParticipantPortal, RegimeKey } from '@/data/portal/types'

const DAY_OF_WEEK = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]

/** Merge user overrides onto the participant's real regime activations. */
function applyOverrides(
  participant: ParticipantPortal,
  overrides: RegimeOverrides,
): ParticipantPortal {
  if (Object.keys(overrides).length === 0) return participant
  return {
    ...participant,
    regime_activations: {
      ...(participant.regime_activations ?? {}),
      ...overrides,
    },
  }
}

export function ProtocolsView() {
  const activePid = usePortalStore((s) => s.activePid)
  const { participant, isLoading, error } = useParticipant()
  const { displayName, persona } = useActiveParticipant()
  const [variants, setVariants] = useContextVariants()
  const [overrides, setOverrides] = useState<RegimeOverrides>({})

  const titleAccessory = (
    <MemberAvatar persona={persona} displayName={displayName} size="lg" />
  )

  const today = useMemo(() => new Date(), [])

  const effectiveParticipant = useMemo(
    () => (participant ? applyOverrides(participant, overrides) : null),
    [participant, overrides],
  )

  const twin = useMemo(() => {
    if (!effectiveParticipant) return null
    const result = pickOptimalSchedule(effectiveParticipant, OBJECTIVE_ORON)
    const neutralBaseline = pickNeutralBaseline(effectiveParticipant, OBJECTIVE_ORON)
    const yesterday = variants.yesterdayDiff
      ? pickYesterdayProtocol(effectiveParticipant, OBJECTIVE_ORON)
      : null
    const wakeTime = derivedWakeTime(effectiveParticipant)
    const regimes = effectiveParticipant.regime_activations ?? {}
    const activeRegimes = (Object.entries(regimes) as Array<[RegimeKey, number]>)
      .filter(([, v]) => v >= 0.3)
      .sort((a, b) => b[1] - a[1])
      .map(([key, activation]) => ({ key, activation }))
    return { result, neutralBaseline, yesterday, wakeTime, activeRegimes }
  }, [effectiveParticipant, variants.yesterdayDiff])

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

  if (!participant || !effectiveParticipant || !twin) return null

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

  const isCounterfactual = Object.keys(overrides).length > 0

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
          <div className="mb-4">
            <CounterfactualSliders
              baselines={participant.regime_activations ?? {}}
              overrides={overrides}
              onOverridesChange={setOverrides}
            />
          </div>
          <OptimalSchedule
            participant={effectiveParticipant}
            result={twin.result}
            neutralBaseline={twin.neutralBaseline}
            yesterday={twin.yesterday}
            dateLabel={dateLabel}
            dayOfWeek={DAY_OF_WEEK[today.getDay()]}
            activeRegimes={twin.activeRegimes}
            wakeTime={twin.wakeTime}
            chipVariant={variants.chip}
            auditPlacement={variants.audit}
            isCounterfactual={isCounterfactual}
            overrides={overrides}
            realBaselines={participant.regime_activations ?? {}}
            onResetCounterfactual={() => setOverrides({})}
          />
        </Card>
      </motion.div>
    </PageLayout>
  )
}

export default ProtocolsView
