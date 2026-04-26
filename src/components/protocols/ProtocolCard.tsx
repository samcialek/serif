import { forwardRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/utils/classNames'
import { Clock, TrendingUp, ChevronRight, Check, Pause, Play, Code, X, Copy } from 'lucide-react'
import { Card, StatusBadge, Badge, Button } from '@/components/common'
import type { Protocol } from '@/types'

// ============================================================================
// Code Modal Component - Shows protocol as JSON
// ============================================================================

interface CodeModalProps {
  protocol: Protocol
  onClose: () => void
}

const CodeModal = ({ protocol, onClose }: CodeModalProps) => {
  const [copied, setCopied] = useState(false)
  const jsonCode = JSON.stringify(protocol, null, 2)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(jsonCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-3xl max-h-[80vh] bg-white rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-100 rounded-lg">
              <Code className="w-4 h-4 text-primary-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Protocol Data</h3>
              <p className="text-xs text-slate-500">JSON representation of this protocol</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
                copied
                  ? 'bg-emerald-50 text-emerald-600'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              )}
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  Copy
                </>
              )}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Code Content */}
        <div className="overflow-auto max-h-[calc(80vh-80px)]">
          <pre className="p-5 text-xs font-mono text-slate-700 bg-slate-50/50 leading-relaxed">
            {jsonCode}
          </pre>
        </div>

        {/* Footer with info */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>
              {protocol.actions.length} actions • {protocol.states?.length || 0} states • {protocol.triggers?.length || 0} triggers
            </span>
            <span className="font-mono">{protocol.id}</span>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

export interface ProtocolCardProps extends React.HTMLAttributes<HTMLDivElement> {
  protocol: Protocol
  onAction?: (action: 'start' | 'pause' | 'complete' | 'view' | 'simulate' | 'code') => void
  showProgress?: boolean
  variant?: 'default' | 'compact' | 'detailed'
}

const categoryEmojis: Record<string, string> = {
  sleep: '😴',
  nutrition: '🥗',
  exercise: '💪',
  stress: '🧘',
  recovery: '❤️‍🩹',
  supplements: '💊',
  timing: '⏰',
}

const difficultyLabels = ['Easy', 'Moderate', 'Challenging', 'Difficult', 'Expert']

export const ProtocolCard = forwardRef<HTMLDivElement, ProtocolCardProps>(
  (
    {
      className,
      protocol,
      onAction,
      showProgress = true,
      variant = 'default',
      ...props
    },
    ref
  ) => {
    const [showCodeModal, setShowCodeModal] = useState(false)
    const emoji = categoryEmojis[protocol.category ?? 'sleep'] || '📋'
    const protocolStatus = protocol.status ?? 'suggested'
    const difficultyLabel = difficultyLabels[(protocol.difficulty || 1) - 1]

    if (variant === 'compact') {
      return (
        <>
          <Card
            ref={ref}
            className={cn('p-3 cursor-pointer hover:border-primary-200', className)}
            onClick={() => onAction?.('view')}
            {...props}
          >
            <div className="flex items-center gap-3">
              <span className="text-xl">{emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900 text-sm truncate">
                    {protocol.title}
                  </span>
                  <StatusBadge status={protocolStatus} />
                </div>
                {protocol.personalizedTiming && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    {protocol.personalizedTiming}
                  </p>
                )}
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setShowCodeModal(true)
                }}
                className="p-1.5 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                title="View Code"
              >
                <Code className="w-4 h-4" />
              </button>
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </div>
          </Card>

          {/* Code Modal */}
          <AnimatePresence>
            {showCodeModal && (
              <CodeModal protocol={protocol} onClose={() => setShowCodeModal(false)} />
            )}
          </AnimatePresence>
        </>
      )
    }

    return (
      <>
      <Card
        ref={ref}
        className={cn('overflow-hidden', className)}
        padding="none"
        data-tour="protocol-list"
        {...props}
      >
        {/* Header */}
        <div className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{emoji}</span>
              <div>
                <span className="text-xs text-gray-500 uppercase">{protocol.category}</span>
                <StatusBadge status={protocolStatus} className="ml-2" />
              </div>
            </div>
            {protocol.difficulty && (
              <Badge variant={protocol.difficulty > 3 ? 'warning' : 'default'} size="sm">
                {difficultyLabel}
              </Badge>
            )}
          </div>

          <h3 className="text-base font-semibold text-gray-900 mb-1">{protocol.title}</h3>
          <p className="text-sm text-gray-600">{protocol.description}</p>

          {/* Personalized recommendation */}
          {protocol.personalizedTiming && (
            <div className="mt-3 flex items-center gap-2 text-sm bg-primary-50 text-primary-700 px-3 py-2 rounded-lg">
              <Clock className="w-4 h-4" />
              <span className="font-medium">{protocol.personalizedTiming}</span>
            </div>
          )}

          {/* Expected impact */}
          {protocol.expectedImpact && (
            <div className="mt-3 flex items-center gap-2 text-sm text-gray-600">
              <TrendingUp className="w-4 h-4 text-green-500" />
              <span>Expected: {protocol.expectedImpact}</span>
            </div>
          )}

          {/* Progress (if active) */}
          {showProgress && protocolStatus === 'active' && protocol.progress !== undefined && (
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                <span>Progress</span>
                <span>{protocol.progress}%</span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary-500 rounded-full transition-all"
                  style={{ width: `${protocol.progress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-4 pb-4 flex items-center gap-2">
          {protocolStatus === 'suggested' && (
            <>
              <Button size="sm" variant="primary" onClick={() => onAction?.('start')}>
                <Play className="w-3 h-3 mr-1" />
                Start Protocol
              </Button>
              <Button size="sm" variant="outline" onClick={() => onAction?.('simulate')}>
                What If?
              </Button>
            </>
          )}
          {protocolStatus === 'active' && (
            <>
              <Button size="sm" variant="secondary" onClick={() => onAction?.('pause')}>
                <Pause className="w-3 h-3 mr-1" />
                Pause
              </Button>
              <Button size="sm" variant="success" onClick={() => onAction?.('complete')}>
                <Check className="w-3 h-3 mr-1" />
                Complete
              </Button>
            </>
          )}
          <Button size="sm" variant="ghost" onClick={() => onAction?.('view')}>
            Details
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowCodeModal(true)}
            className="ml-auto"
          >
            <Code className="w-3 h-3 mr-1" />
            Code
          </Button>
        </div>
      </Card>

      {/* Code Modal */}
      <AnimatePresence>
        {showCodeModal && (
          <CodeModal protocol={protocol} onClose={() => setShowCodeModal(false)} />
        )}
      </AnimatePresence>
      </>
    )
  }
)

ProtocolCard.displayName = 'ProtocolCard'

// Protocol List
export interface ProtocolListProps extends React.HTMLAttributes<HTMLDivElement> {
  protocols: Protocol[]
  onProtocolAction?: (protocolId: string, action: string) => void
  emptyState?: React.ReactNode
  variant?: 'default' | 'compact'
  grouped?: boolean
}

export const ProtocolList = forwardRef<HTMLDivElement, ProtocolListProps>(
  (
    { className, protocols, onProtocolAction, emptyState, variant = 'default', grouped = false, ...props },
    ref
  ) => {
    if (protocols.length === 0 && emptyState) {
      return <div ref={ref} className={className} {...props}>{emptyState}</div>
    }

    if (grouped) {
      const byStatus = {
        active: protocols.filter(p => p.status === 'active'),
        suggested: protocols.filter(p => p.status === 'suggested'),
        completed: protocols.filter(p => p.status === 'completed'),
      }

      return (
        <div ref={ref} className={cn('space-y-6', className)} {...props}>
          {byStatus.active.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 uppercase mb-3">Active Protocols</h3>
              <div className="space-y-3">
                {byStatus.active.map((protocol) => (
                  <ProtocolCard
                    key={protocol.id}
                    protocol={protocol}
                    variant={variant}
                    onAction={(action) => onProtocolAction?.(protocol.id, action)}
                  />
                ))}
              </div>
            </div>
          )}
          {byStatus.suggested.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 uppercase mb-3">Suggested Protocols</h3>
              <div className="space-y-3">
                {byStatus.suggested.map((protocol) => (
                  <ProtocolCard
                    key={protocol.id}
                    protocol={protocol}
                    variant={variant}
                    onAction={(action) => onProtocolAction?.(protocol.id, action)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )
    }

    return (
      <div
        ref={ref}
        className={cn(
          variant === 'compact' ? 'space-y-2' : 'grid gap-4 md:grid-cols-2',
          className
        )}
        {...props}
      >
        {protocols.map((protocol) => (
          <ProtocolCard
            key={protocol.id}
            protocol={protocol}
            variant={variant}
            onAction={(action) => onProtocolAction?.(protocol.id, action)}
          />
        ))}
      </div>
    )
  }
)

ProtocolList.displayName = 'ProtocolList'

export default ProtocolCard
