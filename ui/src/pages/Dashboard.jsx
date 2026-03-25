import React, { useEffect } from 'react'
import { useServersStore, useAlertsStore } from '../store'
import { Link } from 'react-router-dom'

function MetricBar({ value, max = 100 }) {
  const pct = Math.min(100, Math.round((value / max) * 100))
  const cls = pct < 60 ? 'low' : pct < 85 ? 'medium' : 'high'
  return (
    <div className="metric-bar-track">
      <div className="metric-bar-fill" style={{ width: `${pct}%` }} data-level={cls} />
    </div>
  )
}
// Fix metric bar colors dynamically
function ColoredBar({ pct }) {
  const cls = pct < 60 ? 'low' : pct < 85 ? 'medium' : 'high'
  const colors = { low: 'var(--green)', medium: 'var(--orange)', high: 'var(--red)' }
  return (
    <div className="metric-bar-track">
      <div className="metric-bar-fill" style={{ width: `${Math.min(100,pct||0)}%`, background: colors[cls] }} />
    </div>
  )
}

export default function Dashboard() {
  const { servers, fetchServers } = useServersStore()
  const { alerts, fetchAlerts } = useAlertsStore()

  useEffect(() => {
    fetchServers()
    fetchAlerts()
  }, [])

  const onlineCount  = servers.filter(s => s.status === 'online').length
  const offlineCount = servers.filter(s => s.status === 'offline').length
  const degradedCount = servers.filter(s => s.status === 'degraded').length
  const unackAlerts  = alerts.filter(a => !a.is_acknowledged).length

  return (
    <div className="page-content">
      <h1 style={{ marginBottom: 20 }}>Dashboard</h1>

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-label">Total Servers</span>
          <span className="stat-value" style={{ color: 'var(--text-primary)' }}>{servers.length}</span>
          <span className="stat-sub">{onlineCount} online</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Online</span>
          <span className="stat-value" style={{ color: 'var(--green)' }}>{onlineCount}</span>
          <span className="stat-sub">Healthy</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Degraded</span>
          <span className="stat-value" style={{ color: 'var(--orange)' }}>{degradedCount}</span>
          <span className="stat-sub">High load / blip</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Offline</span>
          <span className="stat-value" style={{ color: 'var(--red)' }}>{offlineCount}</span>
          <span className="stat-sub">Missing heartbeat</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Active Alerts</span>
          <span className="stat-value" style={{ color: unackAlerts > 0 ? 'var(--red)' : 'var(--text-primary)' }}>{unackAlerts}</span>
          <span className="stat-sub">Unacknowledged</span>
        </div>
      </div>

      {/* Server cards */}
      <h2 style={{ marginBottom: 12 }}>Servers</h2>
      {servers.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🗄️</div>
          <p>No servers connected yet. Go to <strong>Servers</strong> to add your first agent.</p>
        </div>
      ) : (
        <div className="servers-grid">
          {servers.map(s => {
            const memPct = s.mem_total_mb ? Math.round(s.mem_used_mb / s.mem_total_mb * 100) : 0
            return (
              <Link to={`/servers/${s.id}`} key={s.id} style={{ textDecoration: 'none' }}>
                <div className={`server-card ${s.status}`}>
                  <div className="server-card-header">
                    <div>
                      <div className="server-label">{s.label}</div>
                      {s.group_name && <div className="server-group">{s.group_name}</div>}
                    </div>
                    <span className={`status-badge ${s.status}`}>
                      <span className="status-dot" />
                      {s.status}
                    </span>
                  </div>

                  <div className="metric-row">
                    <div className="metric-label-row">
                      <span>CPU</span>
                      <span>{s.cpu_percent?.toFixed(1) ?? '—'}%</span>
                    </div>
                    <ColoredBar pct={s.cpu_percent} />
                  </div>

                  <div className="metric-row">
                    <div className="metric-label-row">
                      <span>Memory</span>
                      <span>{memPct}%</span>
                    </div>
                    <ColoredBar pct={memPct} />
                  </div>

                  <div className="metric-row">
                    <div className="metric-label-row">
                      <span>Disk</span>
                      <span>{s.disk_percent?.toFixed(1) ?? '—'}%</span>
                    </div>
                    <ColoredBar pct={s.disk_percent} />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                    <span className="text-xs text-muted">{s.container_count} containers</span>
                    {s.tags?.filter(Boolean).map(t => (
                      <span key={t} className="chip">{t}</span>
                    ))}
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
