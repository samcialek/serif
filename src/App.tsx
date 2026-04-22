import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AppShell } from '@/components/layout'
import {
  CoachLandingView,
  ProtocolsView,
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
  TwinPreviewView,
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
          <Route path="/twin" element={<TwinView />} />
          <Route path="/twin-preview" element={<TwinPreviewView />} />
          <Route path="/protocols" element={<ProtocolsView />} />
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
