/**
 * Utilities for simulating API delays and async operations in demos
 */

// ============================================================
// CORE DELAY FUNCTIONS
// ============================================================

/**
 * Simple delay promise
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Delay with random variance for realistic feel
 * @param baseMs Base delay in milliseconds
 * @param variance Percentage variance (0-1)
 */
export function delayWithVariance(baseMs: number, variance: number = 0.3): Promise<void> {
  const minMs = baseMs * (1 - variance)
  const maxMs = baseMs * (1 + variance)
  const actualMs = minMs + Math.random() * (maxMs - minMs)
  return delay(actualMs)
}

/**
 * Simulate network latency based on operation type
 */
export type OperationType = 'fast' | 'normal' | 'slow' | 'sync'

const OPERATION_DELAYS: Record<OperationType, number> = {
  fast: 150,
  normal: 400,
  slow: 800,
  sync: 1200,
}

export function simulateNetworkDelay(operation: OperationType = 'normal'): Promise<void> {
  return delayWithVariance(OPERATION_DELAYS[operation])
}

// ============================================================
// TYPED ASYNC OPERATIONS
// ============================================================

/**
 * Wrap a value with simulated delay
 */
export async function withDelay<T>(value: T, ms: number = 400): Promise<T> {
  await delay(ms)
  return value
}

/**
 * Wrap a function with simulated delay
 */
export function withDelayedResult<T>(
  fn: () => T,
  ms: number = 400
): () => Promise<T> {
  return async () => {
    await delay(ms)
    return fn()
  }
}

/**
 * Simulate async fetch with potential failure
 */
export async function simulateFetch<T>(
  data: T,
  options: {
    delay?: number
    failureRate?: number
    failureMessage?: string
  } = {}
): Promise<T> {
  const { delay: delayMs = 400, failureRate = 0, failureMessage = 'Simulated network error' } = options

  await delayWithVariance(delayMs)

  if (Math.random() < failureRate) {
    throw new Error(failureMessage)
  }

  return data
}

// ============================================================
// PROGRESS SIMULATION
// ============================================================

export interface ProgressState {
  progress: number
  stage: string
  isComplete: boolean
}

/**
 * Simulate a multi-stage operation with progress updates
 */
export async function* simulateProgress(
  stages: { name: string; duration: number }[]
): AsyncGenerator<ProgressState> {
  const totalDuration = stages.reduce((sum, s) => sum + s.duration, 0)
  let elapsed = 0

  for (const stage of stages) {
    const stageSteps = 10
    const stepDuration = stage.duration / stageSteps

    for (let i = 0; i < stageSteps; i++) {
      await delay(stepDuration)
      elapsed += stepDuration
      yield {
        progress: (elapsed / totalDuration) * 100,
        stage: stage.name,
        isComplete: false,
      }
    }
  }

  yield {
    progress: 100,
    stage: 'Complete',
    isComplete: true,
  }
}

/**
 * Sync simulation stages
 */
export const SYNC_STAGES = [
  { name: 'Connecting to device...', duration: 300 },
  { name: 'Authenticating...', duration: 200 },
  { name: 'Fetching new data...', duration: 600 },
  { name: 'Processing metrics...', duration: 400 },
  { name: 'Updating insights...', duration: 500 },
  { name: 'Finalizing...', duration: 200 },
]

/**
 * Inference simulation stages
 */
export const INFERENCE_STAGES = [
  { name: 'Loading personal model...', duration: 200 },
  { name: 'Analyzing patterns...', duration: 400 },
  { name: 'Applying causal inference...', duration: 600 },
  { name: 'Calculating certainty bounds...', duration: 300 },
  { name: 'Generating recommendations...', duration: 400 },
]

// ============================================================
// DEBOUNCE AND THROTTLE
// ============================================================

/**
 * Debounce function for delayed execution
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  ms: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
    timeoutId = setTimeout(() => fn(...args), ms)
  }
}

/**
 * Throttle function for rate limiting
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  ms: number
): (...args: Parameters<T>) => void {
  let lastCall = 0

  return (...args: Parameters<T>) => {
    const now = Date.now()
    if (now - lastCall >= ms) {
      lastCall = now
      fn(...args)
    }
  }
}

// ============================================================
// POLLING AND RETRY
// ============================================================

/**
 * Poll until condition is met
 */
export async function pollUntil(
  condition: () => boolean | Promise<boolean>,
  options: {
    interval?: number
    timeout?: number
    onPoll?: () => void
  } = {}
): Promise<void> {
  const { interval = 500, timeout = 30000, onPoll } = options
  const startTime = Date.now()

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return
    }
    onPoll?.()
    await delay(interval)
  }

  throw new Error('Polling timeout exceeded')
}

/**
 * Retry with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number
    initialDelay?: number
    maxDelay?: number
    onRetry?: (attempt: number, error: Error) => void
  } = {}
): Promise<T> {
  const { maxRetries = 3, initialDelay = 200, maxDelay = 5000, onRetry } = options

  let lastError: Error = new Error('Unknown error')
  let currentDelay = initialDelay

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      if (attempt < maxRetries) {
        onRetry?.(attempt + 1, lastError)
        await delay(currentDelay)
        currentDelay = Math.min(currentDelay * 2, maxDelay)
      }
    }
  }

  throw lastError
}

// ============================================================
// ANIMATION HELPERS
// ============================================================

/**
 * Stagger delay for animations
 */
export function staggerDelay(index: number, baseDelay: number = 50, maxDelay: number = 500): number {
  return Math.min(index * baseDelay, maxDelay)
}

/**
 * Wait for next animation frame
 */
export function nextFrame(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => resolve()))
}

/**
 * Wait for multiple animation frames
 */
export async function waitFrames(count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    await nextFrame()
  }
}

// ============================================================
// CHAOS MODE UTILITIES
// ============================================================

/**
 * Add random chaos to operations (for demo chaos mode)
 */
export async function withChaos<T>(
  operation: () => Promise<T>,
  chaosEnabled: boolean,
  chaosConfig: {
    extraDelayMs?: number
    failureRate?: number
    timeoutRate?: number
  } = {}
): Promise<T> {
  if (!chaosEnabled) {
    return operation()
  }

  const { extraDelayMs = 2000, failureRate = 0.2, timeoutRate = 0.1 } = chaosConfig

  // Random extra delay
  if (Math.random() < 0.5) {
    await delay(Math.random() * extraDelayMs)
  }

  // Random timeout
  if (Math.random() < timeoutRate) {
    await delay(10000)
    throw new Error('Operation timed out (chaos mode)')
  }

  // Random failure
  if (Math.random() < failureRate) {
    throw new Error('Random failure (chaos mode)')
  }

  return operation()
}
