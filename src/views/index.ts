// Views barrel export

export { LandingView } from './LandingView'
export { CoachLandingView } from './CoachLandingView'
// Protocols — the lanes layout is the canonical version.
export { ProtocolsLanesView as ProtocolsView } from './ProtocolsLanesView'
// Visual-magnitude fork lives alongside the canonical route for review.
export { ProtocolsVisualView } from './ProtocolsVisualView'
export { CoachView } from './CoachView'
export { ApiView } from './ApiView'
export { AdminView } from './AdminView'
export { ClientsView } from './ClientsView'
export { UserDetailView } from './UserDetailView'
export { DataView } from './DataView'
export { StyleDemoView } from './StyleDemoView'
export { default as CurveStyleDemoView } from './CurveStyleDemoView'
export { DataValueView } from './DataValueView'
export { PortalView } from './PortalView'
// Twin — the painterly version is the canonical Twin.
export { PainterlyTwinView as TwinView } from './twinForks/leverConcepts/PainterlyTwinView'
// Twin v2 fork (richer modeling + actionability + UX polish).
export { TwinV2View } from './v2/TwinV2View'
// Protocols v2 fork.
export { ProtocolsV2View } from './v2/ProtocolsV2View'
export { BaselineView } from './BaselineView'
export { ExplorationView } from './ExplorationView'
