import { create } from 'zustand'
import type { DemoConfig, SyncSchedule, SyncLogEntry } from '@/types'

interface DemoState {
  // Demo mode
  isGuidedMode: boolean
  guidedMode: boolean  // Alias for isGuidedMode
  currentStepIndex: number
  isPaused: boolean
  showChaos: boolean              // Chaos toggle for resilience demo
  chaosMode: boolean              // Alias for showChaos

  // Configuration
  config: DemoConfig
  certaintyThreshold: number      // Direct accessor for config.certaintyThreshold

  // Integration state
  connectedDevices: string[]
  labConnectionStatus: 'disconnected' | 'connecting' | 'connected'
  syncSchedule: SyncSchedule
  syncLog: SyncLogEntry[]
  isSyncing: boolean
  syncStatus: 'idle' | 'syncing' | 'error' | 'success'

  // Active view state
  activeInsightId: string | null
  activeMemberId: string | null

  // Simulator state
  simulatorActions: Record<string, boolean>  // action_id -> toggled

  // Toast notifications
  toasts: Toast[]

  // Actions
  setGuidedMode: (enabled: boolean) => void
  nextStep: () => void
  prevStep: () => void
  goToStep: (index: number) => void
  togglePause: () => void
  toggleChaos: () => void
  toggleChaosMode: () => void     // Alias for toggleChaos
  setCertaintyThreshold: (value: number) => void

  updateConfig: (updates: Partial<DemoConfig>) => void

  toggleDevice: (deviceId: string) => void
  setLabConnection: (status: 'disconnected' | 'connecting' | 'connected') => void
  updateSyncSchedule: (updates: Partial<SyncSchedule>) => void
  addSyncLog: (entry: SyncLogEntry) => void
  triggerSync: () => Promise<void>
  setSyncStatus: (status: 'idle' | 'syncing' | 'error' | 'success') => void

  setActiveInsight: (id: string | null) => void
  setActiveMember: (id: string | null) => void

  toggleSimulatorAction: (actionId: string) => void
  setSimulatorAction: (actionId: string, value: boolean) => void
  resetSimulator: () => void

  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
}

interface Toast {
  id: string
  type: 'success' | 'error' | 'info' | 'warning'
  title: string
  message?: string
  duration?: number
}

export const useDemoStore = create<DemoState>((set, get) => ({
  // Initial state
  isGuidedMode: false,
  guidedMode: false,
  currentStepIndex: 0,
  isPaused: false,
  showChaos: false,
  chaosMode: false,

  config: {
    certaintyThreshold: 0.75,
    minEffectSize: 0.10,
    minDataDays: 14,
    populationPriorEnabled: true,
  },
  certaintyThreshold: 75,  // Percentage (0-100) for UI

  connectedDevices: ['oura', 'apple-watch'],
  labConnectionStatus: 'disconnected',
  syncSchedule: {
    wearables: 'hourly',
    bloodwork: 'on-result',
    insightDelivery: 'immediate',
    protocolTimes: ['04:00', '12:00'],
  },
  syncLog: [],
  isSyncing: false,
  syncStatus: 'idle',

  activeInsightId: null,
  activeMemberId: null,

  simulatorActions: {},

  toasts: [],

  // Actions
  setGuidedMode: (enabled) => set({ isGuidedMode: enabled, guidedMode: enabled, currentStepIndex: 0 }),

  nextStep: () => set((s) => ({ currentStepIndex: s.currentStepIndex + 1 })),

  prevStep: () => set((s) => ({ currentStepIndex: Math.max(0, s.currentStepIndex - 1) })),

  goToStep: (index) => set({ currentStepIndex: index }),

  togglePause: () => set((s) => ({ isPaused: !s.isPaused })),

  toggleChaos: () => {
    const newChaosState = !get().showChaos
    set({ showChaos: newChaosState, chaosMode: newChaosState })

    // Add toast notification
    get().addToast({
      type: newChaosState ? 'warning' : 'info',
      title: newChaosState ? 'Chaos Mode Enabled' : 'Chaos Mode Disabled',
      message: newChaosState
        ? 'Simulating degraded conditions'
        : 'Normal operation restored',
    })
  },

  toggleChaosMode: () => {
    get().toggleChaos()
  },

  setCertaintyThreshold: (value) => set((s) => ({
    certaintyThreshold: value,
    config: { ...s.config, certaintyThreshold: value / 100 }
  })),

  updateConfig: (updates) => set((s) => ({
    config: { ...s.config, ...updates }
  })),

  toggleDevice: (deviceId) => set((s) => ({
    connectedDevices: s.connectedDevices.includes(deviceId)
      ? s.connectedDevices.filter(d => d !== deviceId)
      : [...s.connectedDevices, deviceId]
  })),

  setLabConnection: (status) => set({ labConnectionStatus: status }),

  setSyncStatus: (status) => set({ syncStatus: status }),

  updateSyncSchedule: (updates) => set((s) => ({
    syncSchedule: { ...s.syncSchedule, ...updates }
  })),

  addSyncLog: (entry) => set((s) => ({
    syncLog: [entry, ...s.syncLog].slice(0, 20)  // Keep last 20
  })),

  triggerSync: async () => {
    set({ isSyncing: true })

    // Simulate sync delay
    await new Promise(r => setTimeout(r, 1500))

    const chaos = get().showChaos
    const newEntry: SyncLogEntry = {
      id: `sync_${Date.now()}`,
      timestamp: new Date().toISOString(),
      type: 'full',
      duration: chaos ? '4.2s' : '1.5s',
      status: chaos ? 'partial' : 'success',
      rowsIngested: chaos ? 8421 : 14203,
      source: 'Health Connect + Mito Labs',
    }

    set((s) => ({
      isSyncing: false,
      syncLog: [newEntry, ...s.syncLog].slice(0, 20),
    }))

    // Add toast notification
    get().addToast({
      type: chaos ? 'warning' : 'success',
      title: chaos ? 'Partial Sync Complete' : 'Sync Complete',
      message: `${newEntry.rowsIngested.toLocaleString()} rows ingested in ${newEntry.duration}`,
    })
  },

  setActiveInsight: (id) => set({ activeInsightId: id }),

  setActiveMember: (id) => set({ activeMemberId: id }),

  toggleSimulatorAction: (actionId) => set((s) => ({
    simulatorActions: {
      ...s.simulatorActions,
      [actionId]: !s.simulatorActions[actionId],
    }
  })),

  setSimulatorAction: (actionId, value) => set((s) => ({
    simulatorActions: {
      ...s.simulatorActions,
      [actionId]: value,
    }
  })),

  resetSimulator: () => set({ simulatorActions: {} }),

  addToast: (toast) => {
    const id = `toast_${Date.now()}`
    set((s) => ({
      toasts: [...s.toasts, { ...toast, id }]
    }))

    // Auto-remove after duration
    const duration = toast.duration ?? 4000
    setTimeout(() => {
      get().removeToast(id)
    }, duration)
  },

  removeToast: (id) => set((s) => ({
    toasts: s.toasts.filter(t => t.id !== id)
  })),
}))
