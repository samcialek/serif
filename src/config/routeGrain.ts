/**
 * Route grain classification: which views are coach-level (practice-wide)
 * vs. patient-level (require an active participant).
 *
 * Used by Header to decide whether to render the PatientSwitcher, and
 * by AppShell to decide when to auto-seed an activePid.
 */

export const COACH_LEVEL_PATHS: readonly string[] = [
  '/',
  '/clients',
  '/data-value',
  '/members',
  '/coach',
  '/api',
  '/admin',
  '/style-demo',
  '/curve-demo',
]

export const PATIENT_LEVEL_PATHS: readonly string[] = [
  '/insights',
  '/data',
  '/integration',
  '/portal',
  '/protocols',
  '/twin',
]

export function isPatientScoped(pathname: string): boolean {
  if (pathname === '/') return false
  return PATIENT_LEVEL_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + '/'),
  )
}

export function isCoachScoped(pathname: string): boolean {
  if (pathname === '/') return true
  return COACH_LEVEL_PATHS.some(
    (p) => p !== '/' && (pathname === p || pathname.startsWith(p + '/')),
  )
}
