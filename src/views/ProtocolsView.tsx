/**
 * ProtocolsView — unified Protocols tab.
 *
 * Holds the layout-mode state and delegates rendering to the existing
 * Lanes or Visual view. The mode toggle is injected into each child
 * view's `actions` slot so it sits next to the data-mode + context
 * toggles in a single header row.
 *
 * URL: /protocols (canonical). Old paths /protocols-visual and
 * /protocols-v2 redirect here.
 *
 * Mode is stored in localStorage so a coach's preference persists
 * across sessions / page reloads.
 */

import { useState } from 'react'
import { Layers, BarChart3 } from 'lucide-react'
import { ProtocolsLanesView } from './ProtocolsLanesView'
import { ProtocolsVisualView } from './ProtocolsVisualView'

type ProtocolsMode = 'lanes' | 'visual'

const MODE_STORAGE_KEY = 'serif:protocols-mode:v1'

function readModeFromStorage(): ProtocolsMode {
  if (typeof localStorage === 'undefined') return 'lanes'
  try {
    const v = localStorage.getItem(MODE_STORAGE_KEY)
    if (v === 'lanes' || v === 'visual') return v
  } catch {
    // ignore
  }
  return 'lanes'
}

function writeModeToStorage(mode: ProtocolsMode): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(MODE_STORAGE_KEY, mode)
  } catch {
    // ignore
  }
}

export function ProtocolsView() {
  const [mode, setMode] = useState<ProtocolsMode>(readModeFromStorage)

  const setModeAndPersist = (next: ProtocolsMode) => {
    setMode(next)
    writeModeToStorage(next)
  }

  const toggle = <ProtocolsModeToggle mode={mode} onChange={setModeAndPersist} />

  return mode === 'lanes' ? (
    <ProtocolsLanesView modeToggle={toggle} />
  ) : (
    <ProtocolsVisualView modeToggle={toggle} />
  )
}

function ProtocolsModeToggle({
  mode,
  onChange,
}: {
  mode: ProtocolsMode
  onChange: (next: ProtocolsMode) => void
}) {
  return (
    <div
      role="group"
      aria-label="Protocols layout"
      className="inline-flex items-center rounded-full p-0.5"
      style={{
        background: '#fff',
        border: '1px solid #e7e5e4',
        fontFamily: 'Inter, sans-serif',
        fontSize: 12,
      }}
    >
      <ToggleButton
        active={mode === 'lanes'}
        onClick={() => onChange('lanes')}
        icon={<Layers className="w-3 h-3" />}
        label="Swim lanes"
      />
      <ToggleButton
        active={mode === 'visual'}
        onClick={() => onChange('visual')}
        icon={<BarChart3 className="w-3 h-3" />}
        label="Compact"
      />
    </div>
  )
}

function ToggleButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full transition-colors"
      style={{
        background: active ? '#fefbf3' : 'transparent',
        color: active ? '#1c1917' : '#78716c',
        border: 'none',
        cursor: 'pointer',
        fontFamily: 'Inter, sans-serif',
        fontSize: 12,
        fontWeight: active ? 500 : 400,
      }}
    >
      {icon}
      {label}
    </button>
  )
}

export default ProtocolsView
