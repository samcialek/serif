import { forwardRef, useState, useCallback } from 'react'
import { cn } from '@/utils/classNames'
import { ChevronRight, ChevronDown, Copy, Check } from 'lucide-react'

export interface JsonViewerProps extends React.HTMLAttributes<HTMLDivElement> {
  data: unknown
  initialExpanded?: boolean
  expandLevel?: number
  theme?: 'light' | 'dark'
  showCopy?: boolean
  showLineNumbers?: boolean
}

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

const syntaxColors = {
  light: {
    key: 'text-purple-600',
    string: 'text-green-600',
    number: 'text-blue-600',
    boolean: 'text-amber-600',
    null: 'text-gray-400',
    bracket: 'text-gray-500',
    line: 'text-gray-300',
    bg: 'bg-gray-50',
  },
  dark: {
    key: 'text-purple-400',
    string: 'text-green-400',
    number: 'text-blue-400',
    boolean: 'text-amber-400',
    null: 'text-gray-500',
    bracket: 'text-gray-400',
    line: 'text-gray-600',
    bg: 'bg-gray-900',
  },
}

interface JsonNodeProps {
  name?: string
  value: JsonValue
  level: number
  expandLevel: number
  theme: 'light' | 'dark'
  isLast: boolean
}

const JsonNode = ({ name, value, level, expandLevel, theme, isLast }: JsonNodeProps) => {
  const [isExpanded, setIsExpanded] = useState(level < expandLevel)
  const colors = syntaxColors[theme]

  const toggleExpand = useCallback(() => {
    setIsExpanded((prev) => !prev)
  }, [])

  const indent = level * 16

  // Primitive values
  if (value === null) {
    return (
      <div style={{ paddingLeft: indent }}>
        {name !== undefined && (
          <span className={colors.key}>"{name}"</span>
        )}
        {name !== undefined && <span className={colors.bracket}>: </span>}
        <span className={colors.null}>null</span>
        {!isLast && <span className={colors.bracket}>,</span>}
      </div>
    )
  }

  if (typeof value === 'string') {
    return (
      <div style={{ paddingLeft: indent }}>
        {name !== undefined && (
          <span className={colors.key}>"{name}"</span>
        )}
        {name !== undefined && <span className={colors.bracket}>: </span>}
        <span className={colors.string}>"{value}"</span>
        {!isLast && <span className={colors.bracket}>,</span>}
      </div>
    )
  }

  if (typeof value === 'number') {
    return (
      <div style={{ paddingLeft: indent }}>
        {name !== undefined && (
          <span className={colors.key}>"{name}"</span>
        )}
        {name !== undefined && <span className={colors.bracket}>: </span>}
        <span className={colors.number}>{value}</span>
        {!isLast && <span className={colors.bracket}>,</span>}
      </div>
    )
  }

  if (typeof value === 'boolean') {
    return (
      <div style={{ paddingLeft: indent }}>
        {name !== undefined && (
          <span className={colors.key}>"{name}"</span>
        )}
        {name !== undefined && <span className={colors.bracket}>: </span>}
        <span className={colors.boolean}>{value ? 'true' : 'false'}</span>
        {!isLast && <span className={colors.bracket}>,</span>}
      </div>
    )
  }

  // Arrays
  if (Array.isArray(value)) {
    const _isEmpty = value.length === 0

    return (
      <div>
        <div
          style={{ paddingLeft: indent }}
          className="cursor-pointer hover:bg-black/5 -mx-2 px-2"
          onClick={toggleExpand}
        >
          <span className="inline-flex items-center">
            {isExpanded ? (
              <ChevronDown className="w-3 h-3 mr-1" />
            ) : (
              <ChevronRight className="w-3 h-3 mr-1" />
            )}
          </span>
          {name !== undefined && (
            <span className={colors.key}>"{name}"</span>
          )}
          {name !== undefined && <span className={colors.bracket}>: </span>}
          <span className={colors.bracket}>[</span>
          {!isExpanded && (
            <>
              <span className="text-gray-400 text-xs mx-1">
                {value.length} item{value.length !== 1 ? 's' : ''}
              </span>
              <span className={colors.bracket}>]</span>
              {!isLast && <span className={colors.bracket}>,</span>}
            </>
          )}
        </div>
        {isExpanded && (
          <>
            {value.map((item, index) => (
              <JsonNode
                key={index}
                value={item}
                level={level + 1}
                expandLevel={expandLevel}
                theme={theme}
                isLast={index === value.length - 1}
              />
            ))}
            <div style={{ paddingLeft: indent }}>
              <span className={colors.bracket}>]</span>
              {!isLast && <span className={colors.bracket}>,</span>}
            </div>
          </>
        )}
      </div>
    )
  }

  // Objects
  if (typeof value === 'object') {
    const entries = Object.entries(value)
    const _isEmpty = entries.length === 0

    return (
      <div>
        <div
          style={{ paddingLeft: indent }}
          className="cursor-pointer hover:bg-black/5 -mx-2 px-2"
          onClick={toggleExpand}
        >
          <span className="inline-flex items-center">
            {isExpanded ? (
              <ChevronDown className="w-3 h-3 mr-1" />
            ) : (
              <ChevronRight className="w-3 h-3 mr-1" />
            )}
          </span>
          {name !== undefined && (
            <span className={colors.key}>"{name}"</span>
          )}
          {name !== undefined && <span className={colors.bracket}>: </span>}
          <span className={colors.bracket}>{'{'}</span>
          {!isExpanded && (
            <>
              <span className="text-gray-400 text-xs mx-1">
                {entries.length} key{entries.length !== 1 ? 's' : ''}
              </span>
              <span className={colors.bracket}>{'}'}</span>
              {!isLast && <span className={colors.bracket}>,</span>}
            </>
          )}
        </div>
        {isExpanded && (
          <>
            {entries.map(([key, val], index) => (
              <JsonNode
                key={key}
                name={key}
                value={val}
                level={level + 1}
                expandLevel={expandLevel}
                theme={theme}
                isLast={index === entries.length - 1}
              />
            ))}
            <div style={{ paddingLeft: indent }}>
              <span className={colors.bracket}>{'}'}</span>
              {!isLast && <span className={colors.bracket}>,</span>}
            </div>
          </>
        )}
      </div>
    )
  }

  return null
}

export const JsonViewer = forwardRef<HTMLDivElement, JsonViewerProps>(
  (
    {
      className,
      data,
      initialExpanded: _initialExpanded = true,
      expandLevel = 2,
      theme = 'light',
      showCopy = true,
      showLineNumbers: _showLineNumbers = false,
      ...props
    },
    ref
  ) => {
    const [copied, setCopied] = useState(false)
    const _colors = syntaxColors[theme]

    const handleCopy = useCallback(async () => {
      try {
        await navigator.clipboard.writeText(JSON.stringify(data, null, 2))
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch (error) {
        console.error('Failed to copy:', error)
      }
    }, [data])

    return (
      <div
        ref={ref}
        className={cn(
          'relative rounded-lg border overflow-hidden',
          theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-gray-50 border-gray-200',
          className
        )}
        {...props}
      >
        {showCopy && (
          <button
            type="button"
            onClick={handleCopy}
            className={cn(
              'absolute top-2 right-2 p-1.5 rounded-md transition-colors',
              theme === 'dark'
                ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'
            )}
          >
            {copied ? (
              <Check className="w-4 h-4 text-green-500" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </button>
        )}
        <div
          className={cn(
            'p-4 font-mono text-sm overflow-auto',
            theme === 'dark' ? 'text-gray-200' : 'text-gray-800'
          )}
        >
          <JsonNode
            value={data as JsonValue}
            level={0}
            expandLevel={expandLevel}
            theme={theme}
            isLast={true}
          />
        </div>
      </div>
    )
  }
)

JsonViewer.displayName = 'JsonViewer'

// Simple code block (for non-interactive display)
export interface CodeBlockProps extends React.HTMLAttributes<HTMLPreElement> {
  code: string
  language?: string
  showCopy?: boolean
  theme?: 'light' | 'dark'
}

export const CodeBlock = forwardRef<HTMLPreElement, CodeBlockProps>(
  ({ className, code, language: _language = 'json', showCopy = true, theme = 'light', ...props }, ref) => {
    const [copied, setCopied] = useState(false)

    const handleCopy = useCallback(async () => {
      try {
        await navigator.clipboard.writeText(code)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch (error) {
        console.error('Failed to copy:', error)
      }
    }, [code])

    return (
      <div className="relative">
        {showCopy && (
          <button
            type="button"
            onClick={handleCopy}
            className={cn(
              'absolute top-2 right-2 p-1.5 rounded-md transition-colors',
              theme === 'dark'
                ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'
            )}
          >
            {copied ? (
              <Check className="w-4 h-4 text-green-500" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </button>
        )}
        <pre
          ref={ref}
          className={cn(
            'p-4 rounded-lg border font-mono text-sm overflow-auto',
            theme === 'dark'
              ? 'bg-gray-900 border-gray-700 text-gray-200'
              : 'bg-gray-50 border-gray-200 text-gray-800',
            className
          )}
          {...props}
        >
          <code>{code}</code>
        </pre>
      </div>
    )
  }
)

CodeBlock.displayName = 'CodeBlock'

export default JsonViewer
