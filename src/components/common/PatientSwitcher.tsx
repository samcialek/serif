import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, User, Search, FlaskConical } from 'lucide-react'
import { cn } from '@/utils/classNames'
import {
  useActiveParticipant,
  useSetActiveParticipant,
} from '@/hooks/useActiveParticipant'
import { NAMED_PERSONA_PIDS } from '@/data/participantRegistry'
import { getPersonaById } from '@/data/personas'

const NAMED_ENTRIES = Object.entries(NAMED_PERSONA_PIDS)
  .map(([pidStr, personaId]) => ({
    pid: Number(pidStr),
    personaId,
    persona: getPersonaById(personaId),
  }))
  .sort((a, b) => a.pid - b.pid)

export interface PatientSwitcherProps {
  className?: string
}

export function PatientSwitcher({ className }: PatientSwitcherProps) {
  const { pid, displayName, kind, cohort } = useActiveParticipant()
  const setParticipant = useSetActiveParticipant()
  const navigate = useNavigate()

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  const handleSelect = (newPid: number) => {
    setParticipant(newPid)
    setOpen(false)
    setQuery('')
  }

  const handlePidSearch = () => {
    const n = Number.parseInt(query.trim(), 10)
    if (Number.isInteger(n) && n > 0 && n <= 1188) {
      handleSelect(n)
    }
  }

  const handleBrowseAll = () => {
    setOpen(false)
    navigate('/portal')
  }

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex items-center gap-2.5 pl-2.5 pr-2 py-1.5 bg-white border border-slate-200 rounded-lg',
          'hover:border-slate-300 hover:shadow-sm transition-all',
        )}
      >
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary-100 to-primary-200 flex items-center justify-center flex-shrink-0">
          <User className="w-3.5 h-3.5 text-primary-600" />
        </div>
        <div className="text-left min-w-0">
          <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider leading-none">
            Select a member
          </p>
          <p className="text-sm font-semibold text-slate-800 truncate mt-0.5">
            {displayName}
          </p>
        </div>
        <ChevronDown
          className={cn(
            'w-4 h-4 text-slate-400 flex-shrink-0 transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setOpen(false)}
              aria-hidden
            />
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.12 }}
              className="absolute top-full left-0 mt-1.5 w-72 bg-white border border-slate-200 rounded-lg shadow-lg z-50 overflow-hidden"
            >
              <div className="px-3 py-2 border-b border-slate-100">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                  Named personas
                </p>
              </div>
              <div className="py-1">
                {NAMED_ENTRIES.map(({ pid: entryPid, persona }) => {
                  const isActive = entryPid === pid
                  const name = persona?.name ?? 'Unknown'
                  const archetype = persona?.archetype ?? ''
                  return (
                    <button
                      key={entryPid}
                      onClick={() => handleSelect(entryPid)}
                      className={cn(
                        'w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-50',
                        isActive && 'bg-primary-50/60',
                      )}
                    >
                      <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                        <User className="w-3.5 h-3.5 text-slate-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{name}</p>
                        {archetype && (
                          <p className="text-[11px] text-slate-400 truncate">{archetype}</p>
                        )}
                      </div>
                      {isActive && (
                        <div className="w-1.5 h-1.5 rounded-full bg-primary-500 flex-shrink-0" />
                      )}
                    </button>
                  )
                })}
              </div>

              <div className="border-t border-slate-100 px-3 py-2">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  Jump to pid
                </p>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handlePidSearch()
                    }}
                    placeholder="Type a pid (e.g. 42)"
                    className={cn(
                      'w-full pl-7 pr-2 py-1.5 text-xs',
                      'bg-slate-50 border border-slate-200 rounded-md',
                      'focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-400',
                    )}
                  />
                </div>
              </div>

              <button
                onClick={handleBrowseAll}
                className="w-full flex items-center gap-2 px-3 py-2.5 border-t border-slate-100 hover:bg-slate-50 text-left"
              >
                <FlaskConical className="w-4 h-4 text-primary-500 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-800">
                    Browse all 1,188 in Portal
                  </p>
                  <p className="text-[11px] text-slate-400">Filterable roster + detail view</p>
                </div>
              </button>

              {kind === 'pseudonym' && cohort && (
                <div className="px-3 py-2 bg-slate-50 border-t border-slate-100 text-[11px] text-slate-500">
                  <span className="font-medium text-slate-600">Cohort:</span> {cohort}
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

export default PatientSwitcher
