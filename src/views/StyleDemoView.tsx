import { useState } from 'react'
import { motion } from 'framer-motion'
import { TrendingUp, Check, ArrowRight, Sparkles, Moon, Zap } from 'lucide-react'

// Sample data for demo
const sampleInsight = {
  title: 'Sleep Duration → Recovery Score',
  theta: '7.2 hours',
  beta: '+18%',
  certainty: 87,
  personalData: 89,
  category: 'Sleep',
}

const sampleMetrics = [
  { label: 'Outcomes', count: 12, color: '#10B981' },
  { label: 'Loads', count: 8, color: '#F59E0B' },
  { label: 'Markers', count: 5, color: '#8B5CF6' },
]

// ============================================================================
// STYLE 1: PRECISION - Neo-Medical
// Clean, clinical, single accent colors, thin borders, generous whitespace
// ============================================================================
function Style1Precision() {
  return (
    <div className="p-8 bg-white rounded-2xl">
      {/* Header */}
      <div className="border-b border-gray-200 pb-4 mb-6">
        <div className="flex items-center gap-2 text-xs font-medium text-emerald-600 uppercase tracking-wider mb-1">
          <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
          Sleep Insight
        </div>
        <h3 className="text-xl font-semibold text-gray-900">{sampleInsight.title}</h3>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-3 gap-px bg-gray-200 rounded-lg overflow-hidden mb-6">
        {sampleMetrics.map((m) => (
          <div key={m.label} className="bg-white p-4 text-center">
            <div className="text-2xl font-bold text-gray-900">{m.count}</div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mt-1">{m.label}</div>
          </div>
        ))}
      </div>

      {/* Insight Card */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <div className="h-1 bg-emerald-500" />
        <div className="p-5">
          <div className="flex items-baseline justify-between mb-4">
            <div>
              <span className="text-sm text-gray-500">Your threshold</span>
              <div className="text-3xl font-bold text-gray-900">{sampleInsight.theta}</div>
            </div>
            <div className="text-right">
              <span className="text-sm text-gray-500">Effect above</span>
              <div className="text-2xl font-bold text-emerald-600">{sampleInsight.beta}</div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-gray-500">
              <span>Certainty</span>
              <span className="font-medium text-gray-900">{sampleInsight.certainty}%</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${sampleInsight.certainty}%` }} />
            </div>
          </div>

          {/* Divider */}
          <div className="h-px bg-gray-100 my-4" />

          {/* Evidence */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">Evidence mix</span>
            <div className="flex items-center gap-2">
              <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden flex">
                <div className="h-full bg-emerald-500" style={{ width: `${sampleInsight.personalData}%` }} />
                <div className="h-full bg-emerald-200" style={{ width: `${100 - sampleInsight.personalData}%` }} />
              </div>
              <span className="text-gray-900 font-medium">{sampleInsight.personalData}% yours</span>
            </div>
          </div>
        </div>
      </div>

      {/* Action */}
      <button className="w-full mt-4 py-3 text-sm font-medium text-emerald-600 border border-emerald-200 rounded-lg hover:bg-emerald-50 transition-colors flex items-center justify-center gap-2">
        View Full Analysis
        <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  )
}

// ============================================================================
// STYLE 2: SIGNAL - Data Visualization Forward
// Bold gradients, dark accents, chart-like feel, strong visual hierarchy
// ============================================================================
function Style2Signal() {
  return (
    <div className="p-8 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-2xl text-white">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="text-emerald-400 text-xs font-bold uppercase tracking-widest mb-1">Sleep Insight</div>
          <h3 className="text-xl font-bold">{sampleInsight.title}</h3>
        </div>
        <div className="px-3 py-1 bg-emerald-500/20 border border-emerald-500/30 rounded-full text-emerald-400 text-xs font-bold">
          {sampleInsight.certainty}% CERTAIN
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {sampleMetrics.map((m) => (
          <div
            key={m.label}
            className="relative p-4 rounded-xl overflow-hidden"
            style={{ backgroundColor: `${m.color}15` }}
          >
            <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
            <div className="relative">
              <div className="text-3xl font-black" style={{ color: m.color }}>{m.count}</div>
              <div className="text-xs text-slate-400 uppercase tracking-wider mt-1">{m.label}</div>
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-1" style={{ backgroundColor: m.color }} />
          </div>
        ))}
      </div>

      {/* Main Card */}
      <div className="bg-white/5 backdrop-blur border border-white/10 rounded-xl p-5">
        <div className="grid grid-cols-2 gap-6 mb-5">
          <div>
            <div className="text-slate-400 text-xs uppercase tracking-wider mb-1">Threshold θ</div>
            <div className="text-4xl font-black bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
              {sampleInsight.theta}
            </div>
          </div>
          <div>
            <div className="text-slate-400 text-xs uppercase tracking-wider mb-1">Effect β</div>
            <div className="text-4xl font-black text-emerald-400">{sampleInsight.beta}</div>
          </div>
        </div>

        {/* Certainty Bar */}
        <div className="h-2 bg-slate-700 rounded-full overflow-hidden mb-2">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-cyan-400 rounded-full"
            style={{ width: `${sampleInsight.certainty}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-slate-500">
          <span>0%</span>
          <span className="text-emerald-400 font-bold">{sampleInsight.certainty}% Certainty</span>
          <span>100%</span>
        </div>

        {/* Evidence Strip */}
        <div className="mt-5 pt-5 border-t border-white/10">
          <div className="flex items-center gap-3">
            <div className="flex-1 h-3 rounded-full overflow-hidden flex">
              <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400" style={{ width: `${sampleInsight.personalData}%` }} />
              <div className="h-full bg-slate-600" style={{ width: `${100 - sampleInsight.personalData}%` }} />
            </div>
            <span className="text-xs text-slate-400">
              <span className="text-emerald-400 font-bold">{sampleInsight.personalData}%</span> Personal
            </span>
          </div>
        </div>
      </div>

      {/* Action */}
      <button className="w-full mt-4 py-3 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white font-bold rounded-xl hover:from-emerald-400 hover:to-cyan-400 transition-all flex items-center justify-center gap-2">
        <Zap className="w-4 h-4" />
        Explore Insight
      </button>
    </div>
  )
}

// ============================================================================
// STYLE 3: MERIDIAN - Soft Science
// Organic curves, warm pastels, thin accent lines, approachable
// ============================================================================
function Style3Meridian() {
  return (
    <div className="p-8 bg-gradient-to-br from-stone-50 to-amber-50/30 rounded-3xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 bg-gradient-to-br from-emerald-100 to-teal-100 rounded-2xl flex items-center justify-center">
          <Moon className="w-6 h-6 text-emerald-600" />
        </div>
        <div>
          <div className="text-xs font-semibold text-emerald-600 uppercase tracking-wide">Sleep Pattern</div>
          <h3 className="text-lg font-semibold text-stone-800">{sampleInsight.title}</h3>
        </div>
      </div>

      {/* Soft Metrics */}
      <div className="flex gap-2 mb-6">
        {sampleMetrics.map((m) => (
          <div
            key={m.label}
            className="flex-1 py-3 px-4 rounded-2xl text-center"
            style={{ backgroundColor: `${m.color}12` }}
          >
            <div className="text-xl font-bold" style={{ color: m.color }}>{m.count}</div>
            <div className="text-xs text-stone-500 mt-0.5">{m.label}</div>
          </div>
        ))}
      </div>

      {/* Main Card */}
      <div className="bg-white rounded-2xl p-5 shadow-sm shadow-stone-200/50 border border-stone-100">
        {/* Colored accent line */}
        <div className="flex gap-1 mb-4">
          <div className="h-1 flex-1 bg-emerald-400 rounded-full" />
          <div className="h-1 w-8 bg-emerald-200 rounded-full" />
          <div className="h-1 w-4 bg-emerald-100 rounded-full" />
        </div>

        <div className="flex items-end justify-between mb-5">
          <div>
            <div className="text-xs text-stone-400 mb-1">Your optimal threshold</div>
            <div className="text-3xl font-bold text-stone-800">{sampleInsight.theta}</div>
          </div>
          <div className="text-right">
            <div className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-50 rounded-full">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-sm font-semibold text-emerald-700">{sampleInsight.beta}</span>
            </div>
          </div>
        </div>

        {/* Soft Progress */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-stone-400">Certainty level</span>
            <span className="font-semibold text-stone-600">{sampleInsight.certainty}%</span>
          </div>
          <div className="h-2.5 bg-stone-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-400 to-teal-400 rounded-full transition-all"
              style={{ width: `${sampleInsight.certainty}%` }}
            />
          </div>
        </div>

        {/* Thin divider with accent */}
        <div className="relative my-5">
          <div className="h-px bg-stone-100" />
          <div className="absolute left-0 top-0 w-12 h-px bg-emerald-300" />
        </div>

        {/* Evidence */}
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="h-2 rounded-full overflow-hidden flex bg-stone-100">
              <div className="h-full bg-emerald-400 rounded-l-full" style={{ width: `${sampleInsight.personalData}%` }} />
            </div>
          </div>
          <div className="text-xs text-stone-500">
            <span className="font-semibold text-emerald-600">{sampleInsight.personalData}%</span> your data
          </div>
        </div>
      </div>

      {/* Action */}
      <button className="w-full mt-4 py-3 text-sm font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-2xl transition-colors flex items-center justify-center gap-2">
        See Full Pattern
        <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  )
}

// ============================================================================
// STYLE 4: CONTRAST - Brutalist Modern
// Hard edges, bold borders, high contrast, magazine-like, striking
// ============================================================================
function Style4Contrast() {
  return (
    <div className="p-8 bg-white rounded-lg border-2 border-black">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="inline-block px-2 py-1 bg-emerald-500 text-white text-xs font-black uppercase tracking-wider mb-2">
            Sleep
          </div>
          <h3 className="text-xl font-black text-black uppercase tracking-tight">{sampleInsight.title}</h3>
        </div>
        <div className="text-4xl font-black text-emerald-500">{sampleInsight.certainty}%</div>
      </div>

      {/* Metrics Strip */}
      <div className="flex border-2 border-black divide-x-2 divide-black mb-6">
        {sampleMetrics.map((m) => (
          <div key={m.label} className="flex-1 p-4 text-center">
            <div className="text-3xl font-black" style={{ color: m.color }}>{m.count}</div>
            <div className="text-xs font-bold text-black uppercase tracking-widest mt-1">{m.label}</div>
          </div>
        ))}
      </div>

      {/* Main Block */}
      <div className="border-2 border-black">
        {/* Color block header */}
        <div className="bg-emerald-500 px-5 py-3 border-b-2 border-black">
          <span className="text-white font-black uppercase tracking-wider text-sm">Your Numbers</span>
        </div>

        <div className="p-5">
          <div className="grid grid-cols-2 gap-4 mb-5">
            <div>
              <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">Threshold θ</div>
              <div className="text-4xl font-black text-black mt-1">{sampleInsight.theta}</div>
            </div>
            <div className="text-right">
              <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">Effect β</div>
              <div className="text-4xl font-black text-emerald-500 mt-1">{sampleInsight.beta}</div>
            </div>
          </div>

          {/* Hard progress bar */}
          <div className="h-4 bg-gray-200 mb-2">
            <div className="h-full bg-black" style={{ width: `${sampleInsight.certainty}%` }} />
          </div>
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">
            Certainty: {sampleInsight.certainty}%
          </div>

          {/* Hard divider */}
          <div className="h-0.5 bg-black my-5" />

          {/* Evidence */}
          <div className="flex items-center gap-4">
            <div className="flex-1 h-3 bg-gray-200 flex">
              <div className="h-full bg-emerald-500" style={{ width: `${sampleInsight.personalData}%` }} />
            </div>
            <span className="text-xs font-black text-black uppercase">{sampleInsight.personalData}% Personal</span>
          </div>
        </div>
      </div>

      {/* Action */}
      <button className="w-full mt-4 py-4 bg-black text-white font-black uppercase tracking-wider hover:bg-emerald-500 transition-colors flex items-center justify-center gap-2">
        Analyze
        <ArrowRight className="w-5 h-5" />
      </button>
    </div>
  )
}

// ============================================================================
// STYLE 5: AURORA - Luminous Glass
// Glassmorphism, subtle glows, layered depth, premium ethereal feel
// ============================================================================
function Style5Aurora() {
  return (
    <div className="p-8 bg-gradient-to-br from-slate-900 via-violet-950 to-slate-900 rounded-3xl relative overflow-hidden">
      {/* Glow effects */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/20 rounded-full blur-3xl" />
      <div className="absolute bottom-0 left-0 w-48 h-48 bg-violet-500/20 rounded-full blur-3xl" />

      <div className="relative">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-white/10 backdrop-blur-xl rounded-xl border border-white/20 flex items-center justify-center">
            <Moon className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <div className="text-emerald-400 text-xs font-medium tracking-wider uppercase">Sleep Insight</div>
            <h3 className="text-lg font-semibold text-white">{sampleInsight.title}</h3>
          </div>
        </div>

        {/* Glass Metrics */}
        <div className="grid grid-cols-3 gap-2 mb-6">
          {sampleMetrics.map((m) => (
            <div
              key={m.label}
              className="p-4 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 text-center relative overflow-hidden group hover:bg-white/10 transition-all"
            >
              {/* Subtle glow on hover */}
              <div
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ boxShadow: `inset 0 0 30px ${m.color}20` }}
              />
              <div className="relative">
                <div className="text-2xl font-bold text-white">{m.count}</div>
                <div className="text-xs text-white/50 mt-1">{m.label}</div>
              </div>
              {/* Bottom glow line */}
              <div
                className="absolute bottom-0 left-1/4 right-1/4 h-px opacity-60"
                style={{ background: `linear-gradient(90deg, transparent, ${m.color}, transparent)` }}
              />
            </div>
          ))}
        </div>

        {/* Main Glass Card */}
        <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-5 relative">
          {/* Top glow line */}
          <div className="absolute top-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-emerald-400/50 to-transparent" />

          <div className="flex items-end justify-between mb-6">
            <div>
              <div className="text-white/40 text-xs uppercase tracking-wider mb-1">Threshold θ</div>
              <div className="text-4xl font-bold text-white">{sampleInsight.theta}</div>
            </div>
            <div className="text-right">
              <div className="text-white/40 text-xs uppercase tracking-wider mb-1">Effect β</div>
              <div className="text-3xl font-bold text-emerald-400">{sampleInsight.beta}</div>
            </div>
          </div>

          {/* Glowing progress */}
          <div className="relative mb-2">
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full relative"
                style={{ width: `${sampleInsight.certainty}%` }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent to-white/30" />
              </div>
            </div>
            {/* Glow underneath */}
            <div
              className="absolute -bottom-2 left-0 h-4 bg-emerald-500/30 blur-md rounded-full"
              style={{ width: `${sampleInsight.certainty}%` }}
            />
          </div>
          <div className="text-xs text-white/40">
            <span className="text-emerald-400 font-medium">{sampleInsight.certainty}%</span> certainty
          </div>

          {/* Divider with glow */}
          <div className="relative my-5">
            <div className="h-px bg-white/10" />
            <div className="absolute left-0 top-0 w-1/3 h-px bg-gradient-to-r from-emerald-400/50 to-transparent" />
          </div>

          {/* Evidence */}
          <div className="flex items-center gap-4">
            <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden flex">
              <div className="h-full bg-emerald-400/80 rounded-l-full" style={{ width: `${sampleInsight.personalData}%` }} />
            </div>
            <span className="text-xs text-white/50">
              <span className="text-emerald-400">{sampleInsight.personalData}%</span> personal
            </span>
          </div>
        </div>

        {/* Action */}
        <button className="w-full mt-4 py-3.5 bg-gradient-to-r from-emerald-500/80 to-emerald-600/80 backdrop-blur text-white font-medium rounded-xl border border-emerald-400/30 hover:from-emerald-500 hover:to-emerald-600 transition-all flex items-center justify-center gap-2 relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
          <span className="relative">Explore Insight</span>
          <Sparkles className="w-4 h-4 relative" />
        </button>
      </div>
    </div>
  )
}

// ============================================================================
// MAIN DEMO VIEW
// ============================================================================
export function StyleDemoView() {
  const [selectedStyle, setSelectedStyle] = useState<number | null>(null)

  const styles = [
    { id: 1, name: 'Precision', subtitle: 'Neo-Medical', description: 'Clean, clinical, generous whitespace. Thin borders and single accent colors per section. Inspired by premium medical devices.', component: Style1Precision },
    { id: 2, name: 'Signal', subtitle: 'Data-Forward', description: 'Bold gradients, dark backgrounds, chart-like feel. High contrast with prominent metrics. Inspired by financial terminals.', component: Style2Signal },
    { id: 3, name: 'Meridian', subtitle: 'Soft Science', description: 'Organic curves, warm pastels, thin accent lines. Scientific but approachable. Inspired by wellness apps.', component: Style3Meridian },
    { id: 4, name: 'Contrast', subtitle: 'Brutalist Modern', description: 'Hard edges, bold borders, high contrast blocks. Magazine-like typography. Striking and memorable.', component: Style4Contrast },
    { id: 5, name: 'Aurora', subtitle: 'Luminous Glass', description: 'Glassmorphism with glows, layered depth, ethereal feel. Premium and futuristic. Inspired by luxury interfaces.', component: Style5Aurora },
  ]

  return (
    <div className="min-h-screen bg-gray-100 py-12 px-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-3">Choose Your Signature Style</h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Select the aesthetic direction that best represents the Serif platform. Each style uses your color scheme with different approaches to color blocking, typography, and visual hierarchy.
          </p>
        </div>

        {/* Style Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-8 mb-12">
          {styles.map((style) => {
            const Component = style.component
            const isSelected = selectedStyle === style.id

            return (
              <motion.div
                key={style.id}
                whileHover={{ y: -4 }}
                className={`relative ${isSelected ? 'ring-4 ring-primary-500 ring-offset-4 rounded-3xl' : ''}`}
              >
                {/* Selection indicator */}
                {isSelected && (
                  <div className="absolute -top-3 -right-3 w-8 h-8 bg-primary-500 rounded-full flex items-center justify-center z-10 shadow-lg">
                    <Check className="w-5 h-5 text-white" />
                  </div>
                )}

                {/* Style Label */}
                <div className="mb-4">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-bold text-primary-600">Style {style.id}</span>
                    <h2 className="text-xl font-bold text-gray-900">{style.name}</h2>
                    <span className="text-sm text-gray-500">/ {style.subtitle}</span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">{style.description}</p>
                </div>

                {/* Preview */}
                <div
                  className="cursor-pointer transition-transform"
                  onClick={() => setSelectedStyle(style.id)}
                >
                  <Component />
                </div>

                {/* Select Button */}
                <button
                  onClick={() => setSelectedStyle(style.id)}
                  className={`w-full mt-4 py-3 rounded-xl font-semibold transition-all ${
                    isSelected
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  {isSelected ? 'Selected' : 'Select This Style'}
                </button>
              </motion.div>
            )
          })}
        </div>

        {/* Selection Summary */}
        {selectedStyle && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl p-8 shadow-lg border border-gray-200 text-center"
          >
            <div className="text-sm font-medium text-primary-600 mb-2">You've selected</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              {styles.find(s => s.id === selectedStyle)?.name} / {styles.find(s => s.id === selectedStyle)?.subtitle}
            </h2>
            <p className="text-gray-600 mb-6">
              Tell me to apply this style and I'll update the entire platform with this aesthetic direction.
            </p>
            <div className="flex justify-center gap-4">
              <button
                onClick={() => setSelectedStyle(null)}
                className="px-6 py-3 border border-gray-300 rounded-xl font-medium text-gray-700 hover:bg-gray-50"
              >
                Compare Again
              </button>
              <button className="px-6 py-3 bg-primary-600 text-white rounded-xl font-medium hover:bg-primary-700">
                Apply This Style
              </button>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}

export default StyleDemoView
