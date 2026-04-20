import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Activity, AlertCircle, Database, Sparkles } from 'lucide-react'
import { PageLayout } from '@/components/layout'
import { Card } from '@/components/common'
import {
  ParticipantDetail,
  ParticipantSelector,
  PortalFilterBar,
} from '@/components/portal'
import { participantLoader } from '@/data/portal/participantLoader'
import { usePortalStore } from '@/stores/portalStore'
import type { PortalManifest } from '@/data/portal/types'

export function PortalView() {
  const [manifest, setManifest] = useState<PortalManifest | null>(null)
  const [manifestError, setManifestError] = useState<Error | null>(null)
  const activePid = usePortalStore((s) => s.activePid)
  const setActivePid = usePortalStore((s) => s.setActivePid)

  useEffect(() => {
    let mounted = true
    participantLoader
      .loadManifest()
      .then((m) => {
        if (mounted) setManifest(m)
      })
      .catch((e: unknown) => {
        if (mounted) setManifestError(e instanceof Error ? e : new Error(String(e)))
      })
    return () => {
      mounted = false
    }
  }, [])

  // Seed active pid to 1 if nothing deep-linked
  useEffect(() => {
    if (manifest && activePid == null) setActivePid(1)
  }, [manifest, activePid, setActivePid])

  return (
    <PageLayout>
      {/* Top bar: participant selector + filters, all inline */}
      <div className="mb-4 flex items-center gap-3 flex-wrap">
        <span className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">
          Member
        </span>
        {manifest && <ParticipantSelector totalParticipants={manifest.n_participants} />}
        <div className="w-px h-5 bg-slate-200" />
        <span className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">
          Filter
        </span>
        <PortalFilterBar />
      </div>

      {/* Manifest banner (condensed) */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <Card padding="md" className="rounded-xl">
          {manifestError ? (
            <div className="flex items-center gap-3 text-rose-600">
              <AlertCircle className="w-5 h-5" />
              <div>
                <p className="font-semibold text-sm">Portal export not available</p>
                <p className="text-xs font-mono">{manifestError.message}</p>
              </div>
            </div>
          ) : !manifest ? (
            <div className="flex items-center gap-3 text-slate-500">
              <Activity className="w-5 h-5 animate-pulse" />
              <span className="text-sm">Loading manifest…</span>
            </div>
          ) : (
            <ManifestSummary manifest={manifest} />
          )}
        </Card>
      </motion.div>

      {/* Full-width detail */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <ParticipantDetail />
      </motion.div>
    </PageLayout>
  )
}

function ManifestSummary({ manifest }: { manifest: PortalManifest }) {
  const exposedPct = Math.round((manifest.exposed_total / (manifest.n_participants * manifest.supported_pairs.length)) * 100)
  return (
    <div className="flex items-start gap-4 flex-wrap">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-primary-50 border border-primary-100 flex items-center justify-center">
          <Database className="w-5 h-5 text-primary-500" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-800">{manifest.engine_version}</p>
          <p className="text-xs text-slate-500">
            Generated {new Date(manifest.generated_at).toLocaleString()}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-5 ml-auto flex-wrap">
        <Stat label="Participants" value={manifest.n_participants.toLocaleString()} />
        <Stat
          label="Exposed insights"
          value={manifest.exposed_total.toLocaleString()}
          sub={`${exposedPct}% of pairs`}
        />
        <Stat
          label="Recommended"
          value={manifest.tier_counts.recommended.toLocaleString()}
          accent="emerald"
        />
        <Stat
          label="Possible"
          value={manifest.tier_counts.possible.toLocaleString()}
          accent="amber"
        />
        <Stat label="Protocols" value={manifest.protocol_count_total.toLocaleString()} />
        <Stat
          label="Mean/participant"
          value={manifest.protocols_per_participant_mean.toFixed(2)}
          sub="protocols"
        />
      </div>

      {manifest.warnings.length > 0 && (
        <div className="w-full mt-3 flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
          <Sparkles className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-amber-700">Engine notes</p>
            <ul className="mt-0.5 text-xs text-amber-600 space-y-0.5">
              {manifest.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string
  sub?: string
  accent?: 'emerald' | 'amber'
}) {
  const accentCls = accent === 'emerald' ? 'text-emerald-700' : accent === 'amber' ? 'text-amber-700' : 'text-slate-800'
  return (
    <div className="flex flex-col items-start">
      <span className="text-[10px] uppercase tracking-wider text-slate-400">{label}</span>
      <span className={`text-base font-semibold tabular-nums ${accentCls}`}>{value}</span>
      {sub && <span className="text-[10px] text-slate-400">{sub}</span>}
    </div>
  )
}

export default PortalView
