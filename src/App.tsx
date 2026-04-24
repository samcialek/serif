import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AppShell } from '@/components/layout'
import {
  CoachLandingView,
  ProtocolsView,
  ProtocolsVisualView,
  CoachView,
  ApiView,
  AdminView,
  ClientsView,
  UserDetailView,
  DataView,
  StyleDemoView,
  CurveStyleDemoView,
  DataValueView,
  PortalView,
  TwinView,
  BaselineView,
  ExplorationView,
} from '@/views'
import { Navigate } from 'react-router-dom'

function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<CoachLandingView />} />
          <Route path="/clients" element={<ClientsView />} />
          <Route path="/clients/:clientId/users/:userId" element={<UserDetailView />} />
          <Route path="/data" element={<DataView />} />
          <Route path="/integration" element={<DataValueView />} />
          <Route path="/insights" element={<PortalView />} />
          <Route path="/portal" element={<Navigate to="/insights" replace />} />
          <Route path="/baseline" element={<BaselineView />} />

          {/* Twin — painterly is the canonical version. */}
          <Route path="/twin" element={<TwinView />} />
          <Route path="/twin/painterly" element={<Navigate to="/twin" replace />} />
          <Route path="/twin/lever-concepts" element={<Navigate to="/twin" replace />} />
          <Route path="/twin/integration" element={<Navigate to="/twin" replace />} />
          <Route path="/twin-preview" element={<Navigate to="/twin" replace />} />
          <Route path="/twin-direct" element={<Navigate to="/twin" replace />} />
          <Route path="/twin-dragdrop" element={<Navigate to="/twin" replace />} />
          <Route path="/twin-graph" element={<Navigate to="/twin" replace />} />
          <Route path="/twin-live" element={<Navigate to="/twin" replace />} />
          <Route path="/twin-cascade" element={<Navigate to="/twin" replace />} />
          <Route path="/twin-compare" element={<Navigate to="/twin" replace />} />
          <Route path="/twin-solve" element={<Navigate to="/twin" replace />} />
          <Route path="/twin-spatial" element={<Navigate to="/twin" replace />} />
          <Route path="/twin-deck" element={<Navigate to="/twin" replace />} />
          <Route path="/twin-living" element={<Navigate to="/twin" replace />} />
          <Route path="/twin-workspace" element={<Navigate to="/twin" replace />} />

          {/* Protocols — lanes is the canonical version. */}
          <Route path="/protocols" element={<ProtocolsView />} />
          <Route path="/protocols-visual" element={<ProtocolsVisualView />} />
          <Route path="/protocols-lanes" element={<Navigate to="/protocols" replace />} />
          <Route path="/protocols-bar" element={<Navigate to="/protocols" replace />} />
          <Route path="/protocols-split" element={<Navigate to="/protocols" replace />} />

          <Route path="/exploration" element={<ExplorationView />} />
          <Route path="/members" element={<CoachView />} />
          <Route path="/coach" element={<Navigate to="/members" replace />} />
          <Route path="/api" element={<ApiView />} />
          <Route path="/admin" element={<AdminView />} />
          <Route path="/style-demo" element={<StyleDemoView />} />
          <Route path="/curve-demo" element={<CurveStyleDemoView />} />
          <Route path="/data-value" element={<Navigate to="/integration" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
