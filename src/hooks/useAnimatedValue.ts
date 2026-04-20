/**
 * Hooks for animating numeric values and other transitions
 */

import { useState, useEffect, useRef, useCallback } from 'react'

/**
 * Easing functions for animations
 */
export const easings = {
  linear: (t: number) => t,
  easeInQuad: (t: number) => t * t,
  easeOutQuad: (t: number) => t * (2 - t),
  easeInOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  easeOutCubic: (t: number) => --t * t * t + 1,
  easeInOutCubic: (t: number) =>
    t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
  easeOutElastic: (t: number) => {
    const c4 = (2 * Math.PI) / 3
    return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1
  },
  easeOutBounce: (t: number) => {
    const n1 = 7.5625
    const d1 = 2.75
    if (t < 1 / d1) return n1 * t * t
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375
    return n1 * (t -= 2.625 / d1) * t + 0.984375
  },
}

export type EasingFunction = keyof typeof easings | ((t: number) => number)

interface UseAnimatedValueOptions {
  duration?: number
  easing?: EasingFunction
  delay?: number
  onComplete?: () => void
}

/**
 * Hook to animate a numeric value with easing
 */
export function useAnimatedValue(
  targetValue: number,
  options: UseAnimatedValueOptions = {}
): number {
  const { duration = 500, easing = 'easeOutCubic', delay = 0, onComplete } = options

  const [value, setValue] = useState(targetValue)
  const frameRef = useRef<number>()
  const startTimeRef = useRef<number>()
  const startValueRef = useRef(targetValue)

  const easingFn = typeof easing === 'function' ? easing : easings[easing]

  useEffect(() => {
    // Cancel any existing animation
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current)
    }

    const startValue = startValueRef.current
    const endValue = targetValue

    // No animation needed if values are the same
    if (startValue === endValue) return

    // Handle delay
    const timeoutId = setTimeout(() => {
      startTimeRef.current = undefined

      const animate = (timestamp: number) => {
        if (!startTimeRef.current) {
          startTimeRef.current = timestamp
        }

        const elapsed = timestamp - startTimeRef.current
        const progress = Math.min(elapsed / duration, 1)
        const easedProgress = easingFn(progress)

        const currentValue = startValue + (endValue - startValue) * easedProgress
        setValue(currentValue)
        startValueRef.current = currentValue

        if (progress < 1) {
          frameRef.current = requestAnimationFrame(animate)
        } else {
          setValue(endValue)
          startValueRef.current = endValue
          onComplete?.()
        }
      }

      frameRef.current = requestAnimationFrame(animate)
    }, delay)

    return () => {
      clearTimeout(timeoutId)
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current)
      }
    }
  }, [targetValue, duration, delay, easingFn, onComplete])

  return value
}

/**
 * Hook for animated counter display
 */
export function useAnimatedCounter(
  value: number,
  options: UseAnimatedValueOptions & { decimals?: number } = {}
): string {
  const { decimals = 0, ...animOptions } = options
  const animatedValue = useAnimatedValue(value, animOptions)
  return animatedValue.toFixed(decimals)
}

/**
 * Hook for animated percentage
 */
export function useAnimatedPercent(
  value: number,
  options: UseAnimatedValueOptions = {}
): string {
  const animatedValue = useAnimatedValue(value, options)
  return `${Math.round(animatedValue)}%`
}

/**
 * Hook for staggered animations (multiple items)
 */
export function useStaggeredAnimation<T>(
  items: T[],
  options: {
    staggerDelay?: number
    duration?: number
    initialDelay?: number
  } = {}
): { item: T; isVisible: boolean; delay: number }[] {
  const { staggerDelay = 50, duration: _duration = 300, initialDelay = 0 } = options
  const [visibleCount, setVisibleCount] = useState(0)

  useEffect(() => {
    setVisibleCount(0)

    const timeouts: ReturnType<typeof setTimeout>[] = []

    items.forEach((_, index) => {
      const timeout = setTimeout(
        () => {
          setVisibleCount(index + 1)
        },
        initialDelay + index * staggerDelay
      )
      timeouts.push(timeout)
    })

    return () => {
      timeouts.forEach(clearTimeout)
    }
  }, [items, staggerDelay, initialDelay])

  return items.map((item, index) => ({
    item,
    isVisible: index < visibleCount,
    delay: index * staggerDelay,
  }))
}

/**
 * Hook for spring-like animation
 */
export function useSpringValue(
  targetValue: number,
  options: {
    stiffness?: number
    damping?: number
    mass?: number
    velocity?: number
  } = {}
): number {
  const { stiffness = 170, damping = 26, mass = 1, velocity: initialVelocity = 0 } = options

  const [value, setValue] = useState(targetValue)
  const velocityRef = useRef(initialVelocity)
  const frameRef = useRef<number>()
  const prevTimeRef = useRef<number>()

  useEffect(() => {
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current)
    }

    const animate = (timestamp: number) => {
      if (!prevTimeRef.current) {
        prevTimeRef.current = timestamp
      }

      const deltaTime = Math.min((timestamp - prevTimeRef.current) / 1000, 0.064)
      prevTimeRef.current = timestamp

      setValue(currentValue => {
        const displacement = currentValue - targetValue
        const springForce = -stiffness * displacement
        const dampingForce = -damping * velocityRef.current
        const acceleration = (springForce + dampingForce) / mass

        velocityRef.current += acceleration * deltaTime
        const newValue = currentValue + velocityRef.current * deltaTime

        // Stop animation when settled
        if (
          Math.abs(velocityRef.current) < 0.001 &&
          Math.abs(newValue - targetValue) < 0.001
        ) {
          return targetValue
        }

        frameRef.current = requestAnimationFrame(animate)
        return newValue
      })
    }

    frameRef.current = requestAnimationFrame(animate)

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current)
      }
    }
  }, [targetValue, stiffness, damping, mass])

  return value
}

/**
 * Hook for progress animation with stages
 */
export function useProgressAnimation(
  stages: { name: string; duration: number }[],
  isActive: boolean
): {
  progress: number
  currentStage: string
  isComplete: boolean
} {
  const [progress, setProgress] = useState(0)
  const [currentStageIndex, setCurrentStageIndex] = useState(0)
  const [isComplete, setIsComplete] = useState(false)

  const totalDuration = stages.reduce((sum, s) => sum + s.duration, 0)

  useEffect(() => {
    if (!isActive) {
      setProgress(0)
      setCurrentStageIndex(0)
      setIsComplete(false)
      return
    }

    let elapsed = 0
    let _currentStageElapsed = 0

    const interval = setInterval(() => {
      elapsed += 50
      _currentStageElapsed += 50

      // Check if current stage is complete
      const stageIdx = currentStageIndex
      let stageTime = 0

      for (let i = 0; i <= stageIdx && i < stages.length; i++) {
        stageTime += stages[i].duration
      }

      if (elapsed >= stageTime && stageIdx < stages.length - 1) {
        setCurrentStageIndex(stageIdx + 1)
      }

      const newProgress = Math.min((elapsed / totalDuration) * 100, 100)
      setProgress(newProgress)

      if (newProgress >= 100) {
        setIsComplete(true)
        clearInterval(interval)
      }
    }, 50)

    return () => clearInterval(interval)
  }, [isActive, stages, totalDuration, currentStageIndex])

  return {
    progress,
    currentStage: stages[currentStageIndex]?.name ?? 'Complete',
    isComplete,
  }
}

/**
 * Hook for delayed visibility (entrance animations)
 */
export function useDelayedVisibility(delay: number = 0): boolean {
  const [isVisible, setIsVisible] = useState(delay === 0)

  useEffect(() => {
    if (delay === 0) {
      setIsVisible(true)
      return
    }

    const timeout = setTimeout(() => {
      setIsVisible(true)
    }, delay)

    return () => clearTimeout(timeout)
  }, [delay])

  return isVisible
}

/**
 * Hook for intersection-based visibility animation
 */
export function useInViewAnimation(
  threshold: number = 0.1
): {
  ref: React.RefCallback<HTMLElement>
  isInView: boolean
  hasAnimated: boolean
} {
  const [isInView, setIsInView] = useState(false)
  const [hasAnimated, setHasAnimated] = useState(false)
  const observerRef = useRef<IntersectionObserver | null>(null)

  const ref = useCallback(
    (node: HTMLElement | null) => {
      if (observerRef.current) {
        observerRef.current.disconnect()
      }

      if (node) {
        observerRef.current = new IntersectionObserver(
          ([entry]) => {
            const inView = entry.isIntersecting
            setIsInView(inView)
            if (inView && !hasAnimated) {
              setHasAnimated(true)
            }
          },
          { threshold }
        )

        observerRef.current.observe(node)
      }
    },
    [threshold, hasAnimated]
  )

  return { ref, isInView, hasAnimated }
}

export default useAnimatedValue
