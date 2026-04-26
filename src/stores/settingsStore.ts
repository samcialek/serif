/**
 * settingsStore — user-level preferences that persist across sessions.
 *
 * Backs the toggles + sliders on the Settings tab (`/admin`). Persists
 * to localStorage via Zustand's persist middleware so a coach's choice
 * (e.g. "show evidence breakdown") survives a page reload.
 *
 * The actual *application* of these settings is the responsibility of
 * the consumer — the store is a pure preference cache. Hooking a
 * setting up to behavior usually means subscribing to the relevant
 * field and conditionally rendering / filtering elsewhere.
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

interface InsightPreferences {
  /** Minimum certainty level for showing insights (0–100). */
  certaintyThreshold: number
  /** Show personal-vs-population evidence breakdown rows. */
  showEvidenceBreakdown: boolean
  /** Show ± posterior bands on dose-response curves. */
  showConfidenceIntervals: boolean
  /** Surface the causal chain (action → mediator → outcome). */
  explainCausalChains: boolean
}

interface NotificationPreferences {
  insights: boolean
  protocols: boolean
  weeklyDigest: boolean
  deviceAlerts: boolean
}

interface PrivacyPreferences {
  contributeToResearch: boolean
  shareWithCoach: boolean
}

interface SettingsState {
  insights: InsightPreferences
  notifications: NotificationPreferences
  privacy: PrivacyPreferences
  setInsight: <K extends keyof InsightPreferences>(
    key: K,
    value: InsightPreferences[K],
  ) => void
  setNotification: <K extends keyof NotificationPreferences>(
    key: K,
    value: NotificationPreferences[K],
  ) => void
  setPrivacy: <K extends keyof PrivacyPreferences>(
    key: K,
    value: PrivacyPreferences[K],
  ) => void
  reset: () => void
}

const DEFAULT_INSIGHTS: InsightPreferences = {
  certaintyThreshold: 50,
  showEvidenceBreakdown: true,
  showConfidenceIntervals: true,
  explainCausalChains: false,
}

const DEFAULT_NOTIFICATIONS: NotificationPreferences = {
  insights: true,
  protocols: true,
  weeklyDigest: true,
  deviceAlerts: false,
}

const DEFAULT_PRIVACY: PrivacyPreferences = {
  contributeToResearch: false,
  shareWithCoach: true,
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      insights: { ...DEFAULT_INSIGHTS },
      notifications: { ...DEFAULT_NOTIFICATIONS },
      privacy: { ...DEFAULT_PRIVACY },
      setInsight: (key, value) =>
        set((state) => ({ insights: { ...state.insights, [key]: value } })),
      setNotification: (key, value) =>
        set((state) => ({
          notifications: { ...state.notifications, [key]: value },
        })),
      setPrivacy: (key, value) =>
        set((state) => ({ privacy: { ...state.privacy, [key]: value } })),
      reset: () =>
        set({
          insights: { ...DEFAULT_INSIGHTS },
          notifications: { ...DEFAULT_NOTIFICATIONS },
          privacy: { ...DEFAULT_PRIVACY },
        }),
    }),
    {
      name: 'serif-settings-store',
      storage: createJSONStorage(() => localStorage),
    },
  ),
)
