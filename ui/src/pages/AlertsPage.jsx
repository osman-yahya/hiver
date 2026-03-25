import React, { useEffect } from 'react'
import { useAlertsStore } from '../store'

export default function AlertsPage() {
  const { alerts, fetchAlerts, acknowledge } = useAlertsStore()

  useEffect(() => { fetchAlerts() }, [])

  const unack = alerts.filter(a => !a.is_acknowledged)
  const ack   = alerts.filter(a => a.is_acknowledged)

  return (
    <div className="page-content">
      <h1 style={{ marginBottom: 20 }}>Alerts</h1>

      {unack.length === 0 && (
        <div className="empty-state mb-6">
          <div className="empty-icon">🔔</div>
          <p>No active alerts. Everything looks good!</p>
        </div>
      )}

      {unack.length > 0 && (
        <>
          <h2 style={{ marginBottom: 12 }}>Active ({unack.length})</h2>
          <div className="card mb-6">
            <div className="table-wrap">
              <table>
                <thead><tr><th>Severity</th><th>Title</th><th>Message</th><th>Fired</th><th>Action</th></tr></thead>
                <tbody>
                  {unack.map(a => (
                    <tr key={a.id}>
                      <td><span className={`sev-${a.severity}`} style={{ fontWeight: 600 }}>{a.severity.toUpperCase()}</span></td>
                      <td style={{ fontWeight: 600 }}>{a.title}</td>
                      <td className="text-sm">{a.message}</td>
                      <td className="text-xs text-muted">{new Date(a.fired_at).toLocaleString()}</td>
                      <td><button className="btn btn-ghost btn-sm" onClick={() => acknowledge(a.id)}>Acknowledge</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {ack.length > 0 && (
        <>
          <h2 style={{ marginBottom: 12 }}>History ({ack.length})</h2>
          <div className="card">
            <div className="table-wrap">
              <table>
                <thead><tr><th>Severity</th><th>Title</th><th>Fired</th><th>Resolved</th></tr></thead>
                <tbody>
                  {ack.map(a => (
                    <tr key={a.id} style={{ opacity: 0.6 }}>
                      <td className={`sev-${a.severity}`}>{a.severity}</td>
                      <td>{a.title}</td>
                      <td className="text-xs">{new Date(a.fired_at).toLocaleString()}</td>
                      <td className="text-xs">{a.resolved_at ? new Date(a.resolved_at).toLocaleString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
