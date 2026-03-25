import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore, useAlertsStore } from '../store'

const NAV = [
  { icon: '🏠', label: 'Dashboard',   to: '/' },
  { icon: '🗄️', label: 'Servers',     to: '/servers' },
  { icon: '🚨', label: 'Alerts',      to: '/alerts', badge: true },
  { icon: '📋', label: 'Error Logs',  to: '/logs' },
  { icon: '📺', label: 'Kiosk',       to: '/kiosk' },
  { icon: '⚙️', label: 'Admin',       to: '/admin', adminOnly: true },
]

export default function Sidebar() {
  const { user, logout } = useAuthStore()
  const { alerts } = useAlertsStore()
  const navigate = useNavigate()
  const unack = alerts.filter(a => !a.is_acknowledged).length

  const handleLogout = () => { logout(); navigate('/login') }

  return (
    <nav className="sidebar">
      <div className="sidebar-logo">
        <span className="logo-icon">🐝</span>
        <div>
          <div className="logo-text">Hiver</div>
          <div className="sidebar-version">v0.1.0</div>
        </div>
      </div>

      <div className="sidebar-nav">
        {NAV.filter(n => !n.adminOnly || user?.role === 'admin').map(n => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === '/'}
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          >
            <span className="nav-icon">{n.icon}</span>
            {n.label}
            {n.badge && unack > 0 && <span className="nav-badge">{unack}</span>}
          </NavLink>
        ))}
      </div>

      <div className="sidebar-bottom">
        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', padding: '4px 12px' }}>
          <span style={{ color: 'var(--text-secondary)' }}>{user?.username}</span>
          <span className="chip" style={{ marginLeft: 6 }}>{user?.role}</span>
        </div>
        <button className="nav-item" onClick={handleLogout} style={{ background: 'none', border: 'none', cursor: 'pointer', width: '100%' }}>
          <span className="nav-icon">🚪</span> Logout
        </button>
      </div>
    </nav>
  )
}
