/**
 * Hook for managing device sync status and simulated sync operations
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { useDemoStore } from '@/stores/demoStore'
import { useConfigStore } from '@/stores/configStore'
import { delay, simulateProgress, SYNC_STAGES } from '@/utils/simulateDelay'

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error'

export interface SyncProgress {
  progress: number
  stage: string
  isComplete: boolean
}

export interface DeviceSyncState {
  deviceId: string
  deviceName: string
  status: SyncStatus
  lastSync: Date | null
  progress: SyncProgress | null
  error: string | null
}

export interface UseSyncStatusReturn {
  // Overall sync state
  isSyncing: boolean
  isAnyDeviceSyncing: boolean
  lastGlobalSync: Date | null

  // Per-device state
  deviceStates: DeviceSyncState[]
  getDeviceState: (deviceId: string) => DeviceSyncState | undefined

  // Actions
  syncDevice: (deviceId: string) => Promise<void>
  syncAllDevices: () => Promise<void>
  cancelSync: (deviceId: string) => void

  // Sync simulation
  simulateSync: () => Promise<void>
  simulateSyncProgress: AsyncGenerator<SyncProgress> | null
}

export function useSyncStatus(): UseSyncStatusReturn {
  const { syncStatus, setSyncStatus, chaosMode, addToast } = useDemoStore()
  const { devices } = useConfigStore()

  const [deviceStates, setDeviceStates] = useState<DeviceSyncState[]>(() =>
    devices.map(device => ({
      deviceId: device.id,
      deviceName: device.name,
      status: 'idle' as SyncStatus,
      lastSync: new Date(Date.now() - Math.random() * 3600000), // Random time in last hour
      progress: null,
      error: null,
    }))
  )

  const [lastGlobalSync, setLastGlobalSync] = useState<Date | null>(new Date())
  const [syncGenerator, setSyncGenerator] = useState<AsyncGenerator<SyncProgress> | null>(null)
  const cancelTokens = useRef<Set<string>>(new Set())

  // Check if any device is syncing
  const isAnyDeviceSyncing = deviceStates.some(d => d.status === 'syncing')

  // Update device state helper
  const updateDeviceState = useCallback(
    (deviceId: string, updates: Partial<DeviceSyncState>) => {
      setDeviceStates(prev =>
        prev.map(d => (d.deviceId === deviceId ? { ...d, ...updates } : d))
      )
    },
    []
  )

  // Get state for a specific device
  const getDeviceState = useCallback(
    (deviceId: string) => {
      return deviceStates.find(d => d.deviceId === deviceId)
    },
    [deviceStates]
  )

  // Sync a single device
  const syncDevice = useCallback(
    async (deviceId: string) => {
      const device = devices.find(d => d.id === deviceId)
      if (!device) return

      // Reset cancel token
      cancelTokens.current.delete(deviceId)

      // Set syncing state
      updateDeviceState(deviceId, {
        status: 'syncing',
        progress: { progress: 0, stage: 'Connecting...', isComplete: false },
        error: null,
      })

      try {
        // Simulate sync stages
        const stages = [...SYNC_STAGES]

        // Add chaos if enabled
        if (chaosMode && Math.random() < 0.2) {
          stages.push({ name: 'Retrying connection...', duration: 1000 })
        }

        let totalDuration = stages.reduce((sum, s) => sum + s.duration, 0)
        let elapsed = 0

        for (const stage of stages) {
          // Check for cancellation
          if (cancelTokens.current.has(deviceId)) {
            updateDeviceState(deviceId, {
              status: 'idle',
              progress: null,
            })
            return
          }

          // Chaos mode random failure
          if (chaosMode && Math.random() < 0.1) {
            throw new Error('Connection lost (chaos mode)')
          }

          const steps = 5
          const stepDuration = stage.duration / steps

          for (let i = 0; i < steps; i++) {
            await delay(stepDuration)
            elapsed += stepDuration

            updateDeviceState(deviceId, {
              progress: {
                progress: (elapsed / totalDuration) * 100,
                stage: stage.name,
                isComplete: false,
              },
            })
          }
        }

        // Success
        updateDeviceState(deviceId, {
          status: 'success',
          lastSync: new Date(),
          progress: { progress: 100, stage: 'Complete', isComplete: true },
        })

        // Reset to idle after brief success display
        await delay(1500)
        updateDeviceState(deviceId, {
          status: 'idle',
          progress: null,
        })
      } catch (error) {
        updateDeviceState(deviceId, {
          status: 'error',
          error: error instanceof Error ? error.message : 'Sync failed',
          progress: null,
        })

        addToast({ title: `Failed to sync ${device.name}`, type: 'error' })
      }
    },
    [devices, chaosMode, updateDeviceState, addToast]
  )

  // Cancel a sync operation
  const cancelSync = useCallback((deviceId: string) => {
    cancelTokens.current.add(deviceId)
  }, [])

  // Sync all devices
  const syncAllDevices = useCallback(async () => {
    setSyncStatus('syncing')

    // Sync devices in parallel
    await Promise.all(devices.map(device => syncDevice(device.id)))

    setLastGlobalSync(new Date())
    setSyncStatus('idle')
    addToast({ title: 'All devices synced successfully', type: 'success' })
  }, [devices, syncDevice, setSyncStatus, addToast])

  // Simple simulate sync (for demo purposes)
  const simulateSync = useCallback(async () => {
    setSyncStatus('syncing')

    const generator = simulateProgress(SYNC_STAGES)
    setSyncGenerator(generator)

    try {
      for await (const progress of generator) {
        // Progress updates happen in the generator
        if (progress.isComplete) break
      }

      setLastGlobalSync(new Date())
      setSyncStatus('idle')
      addToast({ title: 'Sync completed', type: 'success' })
    } catch (error) {
      setSyncStatus('error')
      addToast({ title: 'Sync failed', type: 'error' })
    } finally {
      setSyncGenerator(null)
    }
  }, [setSyncStatus, addToast])

  return {
    isSyncing: syncStatus === 'syncing',
    isAnyDeviceSyncing,
    lastGlobalSync,
    deviceStates,
    getDeviceState,
    syncDevice,
    syncAllDevices,
    cancelSync,
    simulateSync,
    simulateSyncProgress: syncGenerator,
  }
}

/**
 * Hook for time since last sync
 */
export function useTimeSinceSync() {
  const [timeString, setTimeString] = useState('Just now')
  const { deviceStates } = useSyncStatus()

  // Find most recent sync
  const mostRecentSync = deviceStates.reduce((latest, device) => {
    if (!device.lastSync) return latest
    if (!latest) return device.lastSync
    return device.lastSync > latest ? device.lastSync : latest
  }, null as Date | null)

  useEffect(() => {
    const updateTime = () => {
      if (!mostRecentSync) {
        setTimeString('Never')
        return
      }

      const diffMs = Date.now() - mostRecentSync.getTime()
      const diffMins = Math.floor(diffMs / 60000)
      const diffHours = Math.floor(diffMins / 60)

      if (diffMins < 1) {
        setTimeString('Just now')
      } else if (diffMins < 60) {
        setTimeString(`${diffMins}m ago`)
      } else if (diffHours < 24) {
        setTimeString(`${diffHours}h ago`)
      } else {
        setTimeString('Over a day ago')
      }
    }

    updateTime()
    const interval = setInterval(updateTime, 30000) // Update every 30s

    return () => clearInterval(interval)
  }, [mostRecentSync])

  return timeString
}

export default useSyncStatus
