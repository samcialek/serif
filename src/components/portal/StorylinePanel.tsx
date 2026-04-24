/**
 * StorylinePanel — three-sentence paragraph that sits at the top of
 * Protocols / Twin ("today's story") and Insights ("eternal story").
 *
 * The Story object is produced by `buildTodaysStory` or
 * `buildEternalStory` in `utils/storyline.ts`. This component only
 * handles presentation.
 *
 * Two tonal variants:
 *   - 'indigo' (default) — Protocols + Insights. Matches the portal's
 *     indigo callouts (the all-else-equal disclosure, etc.).
 *   - 'cream' — Twin. Matches the painterly cream/stone palette so
 *     the story reads as part of the canvas, not a UI overlay.
 */

import { BookOpen, Sparkles } from 'lucide-react'
import type { Story } from '@/utils/storyline'

type Variant = 'indigo' | 'cream'
type Mode = 'today' | 'eternal'

interface Props {
  story: Story
  /** 'today' = Sparkles icon + "Today" eyebrow; 'eternal' = BookOpen
   *  + "Long-term" eyebrow. */
  mode?: Mode
  variant?: Variant
}

const INDIGO_STYLES = {
  wrapper:
    'rounded-xl border border-indigo-200/80 bg-gradient-to-br from-indigo-50/60 via-white to-white px-4 py-3',
  eyebrow: 'text-indigo-700',
  icon: 'text-indigo-500',
  headline: 'text-slate-900',
  body: 'text-slate-600',
}

const CREAM_STYLES = {
  wrapper: 'rounded-xl px-4 py-3',
  eyebrow: 'text-stone-500',
  icon: 'text-stone-500',
  headline: 'text-stone-900',
  body: 'text-stone-600',
}

const CREAM_INLINE = {
  background: '#fefbf3',
  border: '1px solid #f0e9d8',
}

const EYEBROW: Record<Mode, string> = {
  today: "Today's story",
  eternal: 'Long-term story',
}

export function StorylinePanel({
  story,
  mode = 'today',
  variant = 'indigo',
}: Props) {
  const styles = variant === 'cream' ? CREAM_STYLES : INDIGO_STYLES
  const Icon = mode === 'eternal' ? BookOpen : Sparkles

  return (
    <div
      className={styles.wrapper}
      style={variant === 'cream' ? CREAM_INLINE : undefined}
      role="note"
    >
      <div className={`flex items-center gap-1.5 mb-1 ${styles.eyebrow}`}>
        <Icon className={`w-3.5 h-3.5 ${styles.icon}`} aria-hidden />
        <span className="text-[10px] uppercase tracking-wider font-semibold">
          {EYEBROW[mode]}
        </span>
      </div>
      <p className={`text-[13px] font-semibold leading-snug ${styles.headline}`}>
        {story.headline}
      </p>
      <p className={`text-[12.5px] leading-relaxed mt-1 ${styles.body}`}>
        {story.body}
      </p>
      {story.footnote && (
        <p className="text-[10.5px] text-slate-400 italic mt-1.5">
          {story.footnote}
        </p>
      )}
    </div>
  )
}

export default StorylinePanel
