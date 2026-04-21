import { motion } from 'framer-motion'
import { AlertCircle, Loader2, Users } from 'lucide-react'
import { PageLayout } from '@/components/layout'
import { Card } from '@/components/common'
import { ExplorationList } from '@/components/portal/ExplorationList'
import { useParticipant } from '@/hooks/useParticipant'
import { usePortalStore } from '@/stores/portalStore'

export function ExplorationView() {
  const activePid = usePortalStore((s) => s.activePid)
  const { participant, isLoading, error } = useParticipant()

  const subtitle =
    'Pairs the engine can’t speak to yet, and what it would need to.'

  if (activePid == null) {
    return (
      <PageLayout title="Exploration" subtitle={subtitle}>
        <Card padding="md" className="flex flex-col items-center text-center py-12">
          <div className="w-14 h-14 rounded-2xl bg-primary-50 border border-primary-100 flex items-center justify-center mb-3">
            <Users className="w-6 h-6 text-primary-500" />
          </div>
          <div className="font-semibold text-slate-800 mb-1">No member selected</div>
          <div className="text-sm text-slate-500">
            Pick a member from the sidebar to review their exploration queue.
          </div>
        </Card>
      </PageLayout>
    )
  }

  if (isLoading) {
    return (
      <PageLayout title="Exploration" subtitle={subtitle}>
        <Card padding="md" className="flex flex-col items-center text-center py-12">
          <Loader2 className="w-6 h-6 text-primary-500 animate-spin mb-3" />
          <div className="text-sm text-slate-500">Loading…</div>
        </Card>
      </PageLayout>
    )
  }

  if (error || !participant) {
    return (
      <PageLayout title="Exploration" subtitle={subtitle}>
        <Card padding="md" className="flex flex-col items-center text-center py-12">
          <AlertCircle className="w-6 h-6 text-rose-500 mb-3" />
          <div className="font-semibold text-slate-800 mb-1">
            Couldn’t load this member
          </div>
          <div className="text-sm text-slate-500">{error?.message ?? 'Unknown error'}</div>
        </Card>
      </PageLayout>
    )
  }

  return (
    <PageLayout title="Exploration" subtitle={subtitle}>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <ExplorationList participant={participant} />
      </motion.div>
    </PageLayout>
  )
}

export default ExplorationView
