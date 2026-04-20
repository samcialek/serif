import { AlertTriangle, Calendar, TrendingDown, TrendingUp, Minus } from 'lucide-react'
import { cn } from '@/utils/classNames'
import type { ScheduleItem, WeekContext } from '@/utils/dailySchedule'
import { TierBadge } from './TierBadge'

const SLOT_BG: Record<ScheduleItem['slot'], string> = {
  morning: 'bg-amber-50 border-amber-200',
  afternoon: 'bg-sky-50 border-sky-200',
  evening: 'bg-violet-50 border-violet-200',
}
const SLOT_ACCENT: Record<ScheduleItem['slot'], string> = {
  morning: 'text-amber-700',
  afternoon: 'text-sky-700',
  evening: 'text-violet-700',
}

const STATUS_ICON: Record<WeekContext['stats'][number]['status'], React.ReactElement> = {
  behind: <TrendingDown className="w-3.5 h-3.5 text-rose-600" />,
  on_track: <Minus className="w-3.5 h-3.5 text-emerald-600" />,
  ahead: <TrendingUp className="w-3.5 h-3.5 text-sky-600" />,
}
const STATUS_LABEL: Record<WeekContext['stats'][number]['status'], string> = {
  behind: 'behind',
  on_track: 'on track',
  ahead: 'ahead',
}

interface DailyScheduleProps {
  context: WeekContext
  items: ScheduleItem[]
}

export function DailySchedule({ context, items }: DailyScheduleProps) {
  return (
    <div className="space-y-4">
      {/* Date header */}
      <div className="flex items-baseline justify-between gap-3 pb-3 border-b border-slate-200">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-400" />
            Today · {context.dayOfWeek}
          </h2>
          <p className="text-xs text-slate-500 tabular-nums">{context.dateLabel}</p>
        </div>
        <span className="text-[11px] uppercase tracking-wider text-slate-400">
          {items.length} action{items.length === 1 ? '' : 's'}
        </span>
      </div>

      {/* Context strip: week so far + active regimes */}
      <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
        <p className="text-sm text-slate-700 leading-snug">{context.narrative}</p>
        <div className="flex items-center gap-3 flex-wrap">
          {context.stats.map((s) => (
            <div
              key={s.label}
              className="flex items-center gap-1.5 text-[11px]"
              title={`${STATUS_LABEL[s.status]} this week`}
            >
              {STATUS_ICON[s.status]}
              <span className="capitalize text-slate-600">{s.label}</span>
              <span className="tabular-nums font-medium text-slate-700">
                {s.done}/{s.target}
                {s.unit ? ` ${s.unit}` : ''}
              </span>
            </div>
          ))}
          {context.activeRegimes.length > 0 && (
            <div className="flex items-center gap-1.5 text-[11px] ml-auto">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              <span className="text-amber-800 font-medium">
                {context.activeRegimes
                  .map((r) =>
                    r
                      .replace('_state', '')
                      .replace('_', ' ')
                      .replace(/\b\w/g, (c) => c.toUpperCase()),
                  )
                  .join(' · ')}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Schedule — time-blocked */}
      {items.length === 0 ? (
        <div className="p-6 text-center text-sm text-slate-500 bg-slate-50 border border-slate-100 rounded-xl">
          No actions scheduled today — the engine hasn&apos;t cleared any recommendations
          to the protocol layer for this member.
        </div>
      ) : (
        <ol className="relative border-l-2 border-slate-200 ml-3 space-y-3 pl-5">
          {items.map((item, i) => (
            <li key={`${item.action}_${i}`} className="relative">
              <span
                className={cn(
                  'absolute -left-[30px] top-0 w-6 h-6 rounded-full flex items-center justify-center text-xs',
                  'bg-white border-2',
                  item.slot === 'morning'
                    ? 'border-amber-300'
                    : item.slot === 'afternoon'
                    ? 'border-sky-300'
                    : 'border-violet-300',
                )}
              >
                {item.icon}
              </span>
              <div
                className={cn(
                  'p-3 rounded-lg border',
                  SLOT_BG[item.slot],
                )}
              >
                <div className="flex items-baseline justify-between gap-2 flex-wrap mb-1">
                  <div className="flex items-baseline gap-2 min-w-0">
                    <span
                      className={cn(
                        'text-sm font-bold tabular-nums',
                        SLOT_ACCENT[item.slot],
                      )}
                    >
                      {item.time}
                    </span>
                    <span className="text-sm font-semibold text-slate-800">{item.title}</span>
                  </div>
                  <TierBadge tier={item.tier} />
                </div>
                <p className="text-base font-semibold text-slate-900 mb-1 tabular-nums">
                  {item.dose}
                </p>
                <p className="text-xs text-slate-600 leading-snug">{item.rationale}</p>
                {item.modifier && (
                  <p className="text-[11px] text-amber-800 bg-amber-100/50 border border-amber-200 rounded px-2 py-1 mt-2 flex items-start gap-1.5">
                    <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                    <span>{item.modifier}</span>
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

export default DailySchedule
