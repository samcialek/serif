/**
 * Hook for guided demo tour functionality
 */

import { useState, useCallback, useEffect, useMemo } from 'react'
import { useDemoStore } from '@/stores/demoStore'
import { useNavigate, useLocation } from 'react-router-dom'

export interface DemoStep {
  id: string
  title: string
  description: string
  route: string
  element?: string // CSS selector for highlight
  action?: string // What action to demonstrate
  persona?: string // Recommended persona for this step
}

// Guided demo steps for investor presentation
const DEMO_STEPS: DemoStep[] = [
  {
    id: 'landing',
    title: 'Welcome to Serif',
    description: 'Serif is causal AI middleware for digital health platforms. Let\'s see how it transforms raw health data into actionable insights.',
    route: '/',
  },
  {
    id: 'integration',
    title: 'Data Integration Layer',
    description: 'Serif connects to any wearable or health data source. We normalize data into our COMPLETES framework: Choices, Outcomes, Markers, Physiology, Loads, Environment, Time, Social.',
    route: '/integration',
    element: '[data-tour="device-grid"]',
  },
  {
    id: 'persona-switch',
    title: 'Meet Rajan',
    description: 'Let\'s look at Rajan, a busy tech professional who struggles with sleep consistency. He has 45 days of data.',
    route: '/integration',
    persona: 'rajan',
    element: '[data-tour="persona-selector"]',
  },
  {
    id: 'insights-overview',
    title: 'Personalized Insights',
    description: 'Serif\'s causal AI discovers what actually works for each individual. Notice how insights have certainty levels - we\'re transparent about what we know.',
    route: '/insights',
    element: '[data-tour="insight-cards"]',
  },
  {
    id: 'certainty-slider',
    title: 'Certainty Filtering',
    description: 'Users can adjust their comfort level with uncertainty. Drag the slider to see how higher thresholds reveal fewer but more confident insights.',
    route: '/insights',
    element: '[data-tour="certainty-slider"]',
    action: 'adjust-certainty',
  },
  {
    id: 'insight-detail',
    title: 'Insight Deep Dive',
    description: 'Each insight shows the evidence behind it, including your data vs population priors. Click any insight to see the causal chain.',
    route: '/insights',
    element: '[data-tour="insight-evidence"]',
  },
  {
    id: 'protocols',
    title: 'Actionable Protocols',
    description: 'Insights become protocols - specific, personalized actions. Rajan\'s caffeine cutoff is 2:15 PM because that\'s what HIS data shows.',
    route: '/protocols',
    element: '[data-tour="protocol-list"]',
  },
  {
    id: 'what-if',
    title: 'What-If Simulator',
    description: 'The simulator lets users test changes before committing. "What if I cut caffeine at 1 PM?" See projected impacts with confidence intervals.',
    route: '/protocols',
    element: '[data-tour="simulator"]',
    action: 'run-simulation',
  },
  {
    id: 'sparse-data',
    title: 'Handling Uncertainty',
    description: 'Let\'s switch to Emma, a new user with only 12 days of data. Notice how Serif is honest about uncertainty and leans on population priors.',
    route: '/insights',
    persona: 'emma',
    element: '[data-tour="evidence-weight"]',
  },
  {
    id: 'coach-view',
    title: 'B2B: Coach Dashboard',
    description: 'For health coaches and practitioners, Serif provides client preparation. See digestible summaries without raw data overload.',
    route: '/coach',
    element: '[data-tour="session-prep"]',
  },
  {
    id: 'api-demo',
    title: 'API Integration',
    description: 'Partners integrate via simple REST APIs. Request insights, protocols, or raw inference results. See real response payloads.',
    route: '/api',
    element: '[data-tour="api-response"]',
  },
  {
    id: 'settings',
    title: 'Settings',
    description: 'Configure your preferences, notification settings, and privacy controls.',
    route: '/admin',
  },
  {
    id: 'conclusion',
    title: 'That\'s Serif',
    description: 'Health data alone isn\'t actionable. Serif answers "What actually works for ME?" with transparent, personalized causal AI.',
    route: '/',
  },
]

export interface UseGuidedDemoReturn {
  // State
  isActive: boolean
  currentStep: DemoStep | null
  currentStepIndex: number
  totalSteps: number
  progress: number

  // Navigation
  startTour: () => void
  endTour: () => void
  nextStep: () => void
  previousStep: () => void
  goToStep: (index: number) => void

  // Highlight info
  highlightElement: string | null
  isHighlightVisible: boolean

  // All steps
  steps: DemoStep[]
}

export function useGuidedDemo(): UseGuidedDemoReturn {
  const { guidedMode, setGuidedMode } = useDemoStore()
  const navigate = useNavigate()
  const location = useLocation()

  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [isHighlightVisible, setIsHighlightVisible] = useState(false)

  const currentStep = useMemo(() => {
    if (!guidedMode || currentStepIndex >= DEMO_STEPS.length) return null
    return DEMO_STEPS[currentStepIndex]
  }, [guidedMode, currentStepIndex])

  const progress = useMemo(() => {
    return ((currentStepIndex + 1) / DEMO_STEPS.length) * 100
  }, [currentStepIndex])

  // Start the tour
  const startTour = useCallback(() => {
    setGuidedMode(true)
    setCurrentStepIndex(0)
    navigate('/')
  }, [setGuidedMode, navigate])

  // End the tour
  const endTour = useCallback(() => {
    setGuidedMode(false)
    setCurrentStepIndex(0)
    setIsHighlightVisible(false)
  }, [setGuidedMode])

  // Go to next step
  const nextStep = useCallback(() => {
    if (currentStepIndex < DEMO_STEPS.length - 1) {
      const nextIndex = currentStepIndex + 1
      setCurrentStepIndex(nextIndex)

      const nextStepData = DEMO_STEPS[nextIndex]
      if (nextStepData.route !== location.pathname) {
        navigate(nextStepData.route)
      }
    } else {
      endTour()
    }
  }, [currentStepIndex, location.pathname, navigate, endTour])

  // Go to previous step
  const previousStep = useCallback(() => {
    if (currentStepIndex > 0) {
      const prevIndex = currentStepIndex - 1
      setCurrentStepIndex(prevIndex)

      const prevStepData = DEMO_STEPS[prevIndex]
      if (prevStepData.route !== location.pathname) {
        navigate(prevStepData.route)
      }
    }
  }, [currentStepIndex, location.pathname, navigate])

  // Go to specific step
  const goToStep = useCallback(
    (index: number) => {
      if (index >= 0 && index < DEMO_STEPS.length) {
        setCurrentStepIndex(index)

        const stepData = DEMO_STEPS[index]
        if (stepData.route !== location.pathname) {
          navigate(stepData.route)
        }
      }
    },
    [location.pathname, navigate]
  )

  // Show/hide highlight with delay for animation
  useEffect(() => {
    if (guidedMode && currentStep?.element) {
      const timer = setTimeout(() => {
        setIsHighlightVisible(true)
      }, 500)
      return () => clearTimeout(timer)
    } else {
      setIsHighlightVisible(false)
    }
  }, [guidedMode, currentStep])

  // Keyboard navigation
  useEffect(() => {
    if (!guidedMode) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') {
        nextStep()
      } else if (e.key === 'ArrowLeft') {
        previousStep()
      } else if (e.key === 'Escape') {
        endTour()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [guidedMode, nextStep, previousStep, endTour])

  return {
    isActive: guidedMode,
    currentStep,
    currentStepIndex,
    totalSteps: DEMO_STEPS.length,
    progress,
    startTour,
    endTour,
    nextStep,
    previousStep,
    goToStep,
    highlightElement: currentStep?.element ?? null,
    isHighlightVisible,
    steps: DEMO_STEPS,
  }
}

/**
 * Hook for checking if element should be highlighted
 */
export function useIsHighlighted(selector: string): boolean {
  const { highlightElement, isHighlightVisible } = useGuidedDemo()
  return isHighlightVisible && highlightElement === selector
}

export default useGuidedDemo
