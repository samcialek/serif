import { motion } from 'framer-motion'
import { PageLayout } from '@/components/layout'
import { MemberRoster } from '@/components/coach'

export function CoachView() {
  return (
    <PageLayout
      title="Members"
      subtitle="Roster of all enrolled members · click a row to open their insights"
    >
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <MemberRoster />
      </motion.div>
    </PageLayout>
  )
}

export default CoachView
