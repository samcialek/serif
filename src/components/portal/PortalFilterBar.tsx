import { Users, Activity, X } from 'lucide-react'
import { cn } from '@/utils/classNames'
import {
  usePortalStore,
  type CohortFilter,
  type RegimeChip,
} from '@/stores/portalStore'

const COHORT_OPTIONS: ReadonlyArray<[CohortFilter, string]> = [
  ['all', 'All cohorts'],
  ['cohort_a', 'Cohort A'],
  ['cohort_b', 'Cohort B'],
  ['cohort_c', 'Cohort C'],
]

const REGIME_OPTIONS: ReadonlyArray<[RegimeChip, string]> = [
  ['optimal', 'Optimal'],
  ['overreaching_state', 'Overreaching'],
  ['iron_deficiency_state', 'Iron-deficient'],
  ['sleep_deprivation_state', 'Sleep-deprived'],
  ['inflammation_state', 'Inflamed'],
]

export function PortalFilterBar() {
  const cohortFilter = usePortalStore((s) => s.cohortFilter)
  const regimeFilter = usePortalStore((s) => s.regimeFilter)
  const setCohortFilter = usePortalStore((s) => s.setCohortFilter)
  const setRegimeFilter = usePortalStore((s) => s.setRegimeFilter)

  const hasFilters = cohortFilter !== 'all' || regimeFilter !== null

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <DropdownPill
        icon={<Users className="w-3.5 h-3.5" />}
        active={cohortFilter !== 'all'}
        value={cohortFilter}
        onChange={(v) => setCohortFilter(v as CohortFilter)}
        options={COHORT_OPTIONS}
      />
      <DropdownPill
        icon={<Activity className="w-3.5 h-3.5" />}
        active={regimeFilter !== null}
        value={regimeFilter ?? ''}
        onChange={(v) => setRegimeFilter(v === '' ? null : (v as RegimeChip))}
        options={[['', 'Any regime'], ...REGIME_OPTIONS]}
      />
      {hasFilters && (
        <button
          onClick={() => {
            setCohortFilter('all')
            setRegimeFilter(null)
          }}
          className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors"
          title="Clear filters"
        >
          <X className="w-3 h-3" />
          Clear
        </button>
      )}
    </div>
  )
}

function DropdownPill({
  icon,
  active,
  value,
  onChange,
  options,
}: {
  icon: React.ReactNode
  active: boolean
  value: string
  onChange: (v: string) => void
  options: ReadonlyArray<readonly [string, string]>
}) {
  return (
    <label
      className={cn(
        'relative flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-md border cursor-pointer transition-colors',
        active
          ? 'bg-primary-50 border-primary-300 text-primary-700'
          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50',
      )}
    >
      <span className={active ? 'text-primary-500' : 'text-slate-400'}>{icon}</span>
      <span>{options.find(([v]) => v === value)?.[1] ?? options[0][1]}</span>
      <svg
        className="w-3 h-3 text-slate-400"
        viewBox="0 0 12 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path d="M3 4.5L6 7.5L9 4.5" />
      </svg>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      >
        {options.map(([v, label]) => (
          <option key={v} value={v}>
            {label}
          </option>
        ))}
      </select>
    </label>
  )
}

export default PortalFilterBar
