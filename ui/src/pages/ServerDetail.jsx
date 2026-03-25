import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../store'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

export default function ServerDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [server, setServer] = useState(null)
  const [history, setHistory] = useState([])
  const [historyHours, setHistoryHours] = useState(1)
  const [loading, setLoading] = useState(true)

  const fetchData = async () => {
    try {
      const [sRes, hRes] = await Promise.all([
        api.get(`/servers/${id}`),
        api.get(`/servers/${id}/history`, { params: { hours: historyHours } })
      ])
      setServer(sRes.data)
      setHistory(hRes.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [id, historyHours])

  if (loading) return <div className="page-content"><div className="spinner" style={{ marginTop: 60 }} /></div>
  if (!server) return <div className="page-content"><p>Server not found.</p></div>

  const snap = server.snapshot
  const memPct = snap ? Math.round(snap.mem_used_mb / snap.mem_total_mb * 100) : 0
  const uptime = snap ? formatUptime(snap.uptime_secs) : '—'

  return (
    <div className="page-content">
      <div className="flex items-center gap-3 mb-4">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>← Back</button>
        <h1 style={{ margin: 0 }}>{server.label}</h1>
        <span className={`status-badge ${server.status}`}>
          <span className="status-dot" /> {server.status}
        </span>
        {server.group_name && <span className="chip" style={{ background: 'var(--purple-dim)', color: 'var(--purple)' }}>{server.group_name}</span>}
      </div>

      {/* Snapshot */}
      {snap && (
        <div className="stats-grid mb-6">
          {[
            { label: 'CPU', value: `${snap.cpu_percent?.toFixed(1)}%`, color: getColor(snap.cpu_percent) },
            { label: 'Memory', value: `${memPct}%`, sub: `${snap.mem_used_mb} / ${snap.mem_total_mb} MB`, color: getColor(memPct) },
            { label: 'Disk', value: `${snap.disk_percent?.toFixed(1)}%`, sub: `${snap.disk_used_gb} / ${snap.disk_total_gb} GB`, color: getColor(snap.disk_percent) },
            { label: 'Load (1m)', value: snap.load_1?.toFixed(2), color: 'var(--blue)' },
            { label: 'Uptime', value: uptime, color: 'var(--text-primary)' },
            { label: 'Net In', value: fmtBytes(snap.net_bytes_in), color: 'var(--green)' },
            { label: 'Net Out', value: fmtBytes(snap.net_bytes_out), color: 'var(--orange)' },
          ].map(({ label, value, sub, color }) => (
            <div className="stat-card" key={label}>
              <span className="stat-label">{label}</span>
              <span className="stat-value" style={{ color, fontSize: '1.4rem' }}>{value}</span>
              {sub && <span className="stat-sub">{sub}</span>}
            </div>
          ))}
        </div>
      )}

      {/* History Chart */}
      <div className="card mb-6">
        <div className="card-header">
          <h2>History</h2>
          <div className="flex gap-2">
            {[1, 6, 24].map(h => (
              <button key={h} className={`btn btn-sm ${historyHours === h ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setHistoryHours(h)}>{h}h</button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={history} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="t" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickFormatter={t => t.slice(11, 16)} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
            <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
              labelFormatter={t => t.slice(11, 16)} formatter={(val, name) => [`${val}%`, name.toUpperCase()]} />
            <Line type="monotone" dataKey="cpu" stroke="var(--accent)" strokeWidth={1.5} dot={false} name="cpu" />
            <Line type="monotone" dataKey="mem" stroke="var(--blue)" strokeWidth={1.5} dot={false} name="mem" />
            <Line type="monotone" dataKey="disk" stroke="var(--purple)" strokeWidth={1.5} dot={false} name="disk" />
          </LineChart>
        </ResponsiveContainer>
        <div className="flex gap-4 mt-2" style={{ justifyContent: 'center' }}>
          {[['cpu', 'var(--accent)'], ['mem', 'var(--blue)'], ['disk', 'var(--purple)']].map(([k, c]) => (
            <span key={k} className="text-xs flex items-center gap-2">
              <span style={{ width: 10, height: 3, background: c, display: 'inline-block', borderRadius: 2 }} />
              {k.toUpperCase()}
            </span>
          ))}
        </div>
      </div>

      {/* Containers */}
      <div className="card">
        <h2 style={{ marginBottom: 16 }}>Containers ({server.containers.length})</h2>
        {server.containers.length === 0 ? (
          <p className="text-muted text-sm">No containers detected.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Image</th>
                  <th>Status</th>
                  <th>CPU %</th>
                  <th>Memory</th>
                  <th>Restarts</th>
                </tr>
              </thead>
              <tbody>
                {server.containers.map(c => (
                  <tr key={c.container_id}>
                    <td className="text-mono">{c.name}</td>
                    <td className="text-xs text-muted">{c.image}</td>
                    <td>
                      <span style={{ color: c.status.includes('Up') ? 'var(--green)' : 'var(--red)', fontSize: '0.78rem' }}>
                        {c.status}
                      </span>
                    </td>
                    <td>{c.cpu_percent?.toFixed(1)}%</td>
                    <td className="text-xs">{c.mem_usage_mb?.toFixed(0)} / {c.mem_limit_mb?.toFixed(0)} MB</td>
                    <td style={{ color: c.restart_count > 0 ? 'var(--orange)' : 'var(--text-muted)' }}>
                      {c.restart_count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function getColor(pct) {
  if (pct < 60) return 'var(--green)'
  if (pct < 85) return 'var(--orange)'
  return 'var(--red)'
}

function fmtBytes(bytes) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  while (bytes >= 1024 && i < units.length - 1) { bytes /= 1024; i++ }
  return `${bytes.toFixed(1)} ${units[i]}`
}

function formatUptime(secs) {
  if (!secs) return '—'
  const d = Math.floor(secs / 86400)
  const h = Math.floor((secs % 86400) / 3600)
  const m = Math.floor((secs % 3600) / 60)
  return [d && `${d}d`, h && `${h}h`, `${m}m`].filter(Boolean).join(' ')
}
