import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { PageLayout } from '@/components/layout'
import { DataModeToggle } from '@/components/common'
import { ParticipantDetail } from '@/components/portal'
import { participantLoader } from '@/data/portal/participantLoader'
import { usePortalStore } from '@/stores/portalStore'

export function PortalView() {
  const activePid = usePortalStore((s) => s.activePid)
  const setActivePid = usePortalStore((s) => s.setActivePid)

  useEffect(() => {
    let mounted = true
    participantLoader
      .loadManifest()
      .then(() => {
        if (mounted && activePid == null) setActivePid(1)
      })
      .catch(() => {})
    return () => {
      mounted = false
    }
  }, [activePid, setActivePid])

  return (
    <PageLayout>
      <div className="flex justify-end mb-3">
        <DataModeToggle />
      </div>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <ParticipantDetail />
      </motion.div>
    </PageLayout>
  )
}

export default PortalView
