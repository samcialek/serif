import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { AlertCircle, Loader2, Users } from 'lucide-react'
import { PageLayout } from '@/components/layout'
import { Card } from '@/components/common'
import { DailySchedule } from '@/components/portal'
import { useParticipant } from '@/hooks/useParticipant'
import { useActiveParticipant } from '@/hooks/useActiveParticipant'
import { usePortalStore } from '@/stores/portalStore'
import { deriveTodaySchedule, deriveWeekContext } from '@/utils/dailySchedule'

export function ProtocolsView() {
  const activePid = usePortalStore((s) => s.activePid)
  const { participant, isLoading, error } = useParticipant()
  const { displayName } = useActiveParticipant()

  const today = useMemo(() => new Date(), [])
  const { items, context } = useMemo(() => {
    if (!participant) return { items: [], context: null }
    return {
      items: deriveTodaySchedule(participant, today),
      context: deriveWeekContext(participant, today),
    }
  }, [participant, today])

  if (activePid == null) {
    return (
      <PageLayout
        title="Today's plan"
        subtitle="Specific actions for today, adjusted for week-to-date load and active regimes"
      >
        <Card padding="md" className="flex flex-col items-center text-center py-12">
          <div className="w-14 h-14 rounded-2xl bg-primary-50 border border-primary-100 flex items-center justify-center mb-3">
            <Users className="w-6 h-6 text-primary-500" />
          </div>
          <h3 className="text-base font-semibold text-slate-700 mb-1">
            Select a member
          </h3>
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

  if (!participant || !context) return null

  return (
    <PageLayout
      title={`${displayName} — today's plan`}
      subtitle="Specific actions for today, derived from weekly targets + week-to-date load + active regimes"
    >
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <Card padding="md" className="rounded-xl">
          <DailySchedule context={context} items={items} />
        </Card>
      </motion.div>
    </PageLayout>
  )
}

export default ProtocolsView
