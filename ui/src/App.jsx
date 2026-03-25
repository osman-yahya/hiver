import React, { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from './store'
import { useWebSocket } from './hooks/useWebSocket'
import Sidebar from './components/Sidebar'
import LoginPage from './pages/LoginPage'
import Dashboard from './pages/Dashboard'
import ServersPage from './pages/ServersPage'
import ServerDetail from './pages/ServerDetail'
import LogsPage from './pages/LogsPage'
import AlertsPage from './pages/AlertsPage'
import KioskPage from './pages/KioskPage'
import AdminPage from './pages/AdminPage'
import './index.css'

function AppShell() {
  useWebSocket()
  const location = useLocation()
  const isKiosk = location.pathname === '/kiosk'

  if (isKiosk) {
    return (
      <Routes>
        <Route path="/kiosk" element={<KioskPage />} />
      </Routes>
    )
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-content">
        <Routes>
          <Route path="/"            element={<Dashboard />} />
          <Route path="/servers"     element={<ServersPage />} />
          <Route path="/servers/:id" element={<ServerDetail />} />
          <Route path="/logs"        element={<LogsPage />} />
          <Route path="/alerts"      element={<AlertsPage />} />
          <Route path="/admin"       element={<AdminPage />} />
          <Route path="*"            element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  )
}

function ProtectedRoute({ children }) {
  const { token } = useAuthStore()
  return token ? children : <Navigate to="/login" replace />
}

export default function App() {
  const { token, fetchMe } = useAuthStore()

  useEffect(() => {
    if (token) fetchMe()
  }, [token])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={token ? <Navigate to="/" replace /> : <LoginPage />} />
        <Route path="/*" element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        } />
      </Routes>
    </BrowserRouter>
  )
}
