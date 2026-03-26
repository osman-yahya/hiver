import React, { useEffect, useState, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useServersStore, useAlertsStore, api } from '../store'
import { useWebSocket } from '../hooks/useWebSocket'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line, RadialBarChart, RadialBar, Legend } from 'recharts'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getC(pct) {
  if (typeof pct !== 'number' || isNaN(pct)) return 'var(--text-muted)'
  if (pct < 60) return 'var(--green)'
  if (pct < 85) return 'var(--orange)'
  return 'var(--red)'
}

function getTempColor(c) {
  if (typeof c !== 'number') return 'var(--text-muted)'
  if (c < 50) return '#00e5ff'
  if (c < 70) return '#ffaa00'
  if (c < 85) return '#ff6600'
  return '#ff2222'
}

function TempBadge({ value, size = 'sm' }) {
  if (typeof value !== 'number') return null
  const color = getTempColor(value)
  const fs = size === 'lg' ? '2rem' : size === 'md' ? '1.2rem' : '0.9rem'
  return (
    <span style={{ color, fontWeight: 700, fontSize: fs, textShadow: `0 0 8px ${color}55` }}>
      🌡️ {Math.round(value)}°C
    </span>
  )
}

function MetricBar({ value, height = 8 }) {
  const color = getC(value)
  return (
    <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 4, height, overflow: 'hidden' }}>
      <div style={{ width: `${Math.min(100, value || 0)}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.5s ease' }} />
    </div>
  )
}

const statusLabel = { online: '🟢 Online', degraded: '🟠 Degraded', offline: '🔴 Offline', unknown: '⚫ Unknown' }
const statusColor = { online: 'var(--green)', degraded: 'var(--orange)', offline: 'var(--red)', unknown: '#666' }

function useLocalStorage(key, initialValue) {
  const [storedValue, setStoredValue] = useState(() => {
    try {
      const item = window.localStorage.getItem(key)
      return item ? JSON.parse(item) : initialValue
    } catch { return initialValue }
  })
  const setValue = value => {
    try {
      const v = value instanceof Function ? value(storedValue) : value
      setStoredValue(v)
      window.localStorage.setItem(key, JSON.stringify(v))
    } catch {}
  }
  return [storedValue, setValue]
}

function useServerHistory(serverId) {
  const [history, setHistory] = useState([])
  useEffect(() => {
    if (!serverId) return
    api.get(`/servers/${serverId}/history?hours=1`).then(r => setHistory(r.data)).catch(() => {})
    const interval = setInterval(() => {
      api.get(`/servers/${serverId}/history?hours=1`).then(r => setHistory(r.data)).catch(() => {})
    }, 30000)
    return () => clearInterval(interval)
  }, [serverId])
  return history
}

// ─── Inline Graph Component (properly bounded, no minHeight) ─────────────────

function ServerHistoryGraph({ serverId, label, showLegend = true }) {
  const history = useServerHistory(serverId)
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {label && <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 4 }}>1-Hour History: {label}</div>}
      <div style={{ flex: 1, minHeight: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={history} margin={{ top: 6, right: 8, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id={`gcpu_${serverId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#00e5ff" stopOpacity={0.7}/>
                <stop offset="95%" stopColor="#00e5ff" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id={`gmem_${serverId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#b14bff" stopOpacity={0.7}/>
                <stop offset="95%" stopColor="#b14bff" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
            <XAxis dataKey="t" tickFormatter={t => { const d = new Date(t); return `${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}` }} stroke="var(--text-muted)" tick={{ fontSize: 10 }} />
            <YAxis stroke="var(--text-muted)" domain={[0, 100]} tick={{ fontSize: 10 }} />
            <Tooltip
              contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, color: '#fff', fontSize: 12 }}
              labelFormatter={l => new Date(l).toLocaleTimeString()}
            />
            <Area type="monotone" dataKey="cpu" name="CPU %" stroke="#00e5ff" fillOpacity={1} fill={`url(#gcpu_${serverId})`} strokeWidth={2} dot={false} />
            <Area type="monotone" dataKey="mem" name="Mem %" stroke="#b14bff" fillOpacity={1} fill={`url(#gmem_${serverId})`} strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ─── All Views ────────────────────────────────────────────────────────────────

/** 1. Grid View */
function KioskGridView({ servers }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
      {servers.map(s => {
        const memPct = s.mem_total_mb ? Math.round(s.mem_used_mb / s.mem_total_mb * 100) : 0
        return (
          <div className={`server-card ${s.status}`} key={s.id} style={{ transform: 'none', cursor: 'default' }}>
            <div className="server-card-header">
              <div>
                <div className="server-label">{s.label}</div>
                {s.group_name && <div className="server-group">{s.group_name}</div>}
              </div>
              <span className={`status-badge ${s.status}`}>{statusLabel[s.status]}</span>
            </div>
            <div style={{ marginBottom: 12 }}><TempBadge value={s.temperature_c} /></div>
            {[['CPU', s.cpu_percent], ['Memory', memPct], ['Disk', s.disk_percent]].map(([name, val]) => (
              <div className="metric-row" key={name}>
                <div className="metric-label-row">
                  <span>{name}</span>
                  <span style={{ color: getC(val) }}>{typeof val === 'number' ? val.toFixed(1) : '—'}%</span>
                </div>
                <MetricBar value={val} />
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, gap: 8 }}>
              {[
                [s.container_count ?? 0, 'Containers'],
                [s.uptime_secs ? `${Math.floor(s.uptime_secs / 86400)}d` : '0d', 'Uptime'],
              ].map(([val, label]) => (
                <div key={label} style={{ flex: 1, textAlign: 'center', background: 'var(--bg-base)', padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{val}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** 2. Carousel (Focus) View */
function KioskCarouselView({ servers, carouselSpeed }) {
  const [idx, setIdx] = useState(0)
  useEffect(() => {
    if (servers.length <= 1) return
    const i = setInterval(() => setIdx(p => (p + 1) % servers.length), (carouselSpeed || 15) * 1000)
    return () => clearInterval(i)
  }, [servers.length, carouselSpeed])

  if (servers.length === 0) return <div style={{ textAlign: 'center', padding: 100, color: 'var(--text-muted)' }}>No servers online.</div>
  const s = servers[idx] || servers[0]
  if (!s) return null
  const memPct = s.mem_total_mb ? Math.round(s.mem_used_mb / s.mem_total_mb * 100) : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 16 }}>
      {/* Focus Stats */}
      <div className={`server-card ${s.status}`} style={{ cursor: 'default', transform: 'none', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 150 }}>
            <div className="server-label" style={{ fontSize: '2rem' }}>{s.label}</div>
            {s.group_name && <div className="server-group">{s.group_name}</div>}
            <div style={{ marginTop: 8 }}>
              <span className={`status-badge ${s.status}`} style={{ fontSize: '1rem', padding: '6px 14px' }}>{statusLabel[s.status]}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
            {[['CPU', s.cpu_percent], ['RAM', memPct], ['Disk', s.disk_percent]].map(([name, val]) => (
              <div key={name} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '2.5rem', fontWeight: 800, color: getC(val) }}>{typeof val === 'number' ? val.toFixed(1) : '—'}%</div>
                <div style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, fontSize: '0.8rem' }}>{name}</div>
              </div>
            ))}
            <div style={{ textAlign: 'center' }}>
              <TempBadge value={s.temperature_c} size="lg" />
              <div style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, fontSize: '0.8rem', marginTop: 4 }}>Temp</div>
            </div>
          </div>
        </div>
      </div>
      {/* Graph — fills remaining space */}
      <div className="card" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <ServerHistoryGraph serverId={s.id} label={s.label} />
      </div>
    </div>
  )
}

/** 3. Mixed View (Carousel + Grid side by side) */
function KioskMixedView({ servers, carouselSpeed }) {
  return (
    <div style={{ display: 'flex', gap: 24, height: '100%' }}>
      <div style={{ flex: 1.6, overflow: 'hidden' }}>
        <KioskCarouselView servers={servers} carouselSpeed={carouselSpeed} />
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }} className="custom-scrollbar">
        <KioskGridView servers={servers} />
      </div>
    </div>
  )
}

/** 4. Sidebar+Graph View */
function KioskSidebarGraphView({ servers, carouselSpeed }) {
  const [idx, setIdx] = useState(0)
  useEffect(() => {
    if (servers.length <= 1) return
    const i = setInterval(() => setIdx(p => (p + 1) % servers.length), (carouselSpeed || 15) * 1000)
    return () => clearInterval(i)
  }, [servers.length, carouselSpeed])

  if (servers.length === 0) return <div style={{ color: 'var(--text-muted)', padding: 40 }}>No servers online.</div>
  const s = servers[idx] || servers[0]

  return (
    <div style={{ display: 'flex', height: '100%', gap: 16 }}>
      {/* Sidebar */}
      <div style={{ width: 300, display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }} className="custom-scrollbar">
        {servers.map((sv, i) => {
          const isActive = i === idx
          const memPct = sv.mem_total_mb ? Math.round(sv.mem_used_mb / sv.mem_total_mb * 100) : 0
          return (
            <div key={sv.id} onClick={() => setIdx(i)} style={{
              padding: '12px 16px', borderRadius: 8, cursor: 'pointer',
              background: isActive ? 'var(--bg-surface)' : 'transparent',
              border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
              boxShadow: isActive ? '0 0 15px rgba(100,200,255,0.2)' : 'none',
              transition: 'all 0.3s ease'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ fontWeight: 'bold', color: isActive ? '#fff' : 'var(--text)' }}>{sv.label}</div>
                <div style={{ fontSize: '0.75rem', color: statusColor[sv.status] }}>{statusLabel[sv.status]}</div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', gap: 8 }}>
                <span style={{ color: getC(sv.cpu_percent) }}>CPU {typeof sv.cpu_percent === 'number' ? sv.cpu_percent.toFixed(1) : '—'}%</span>
                <span style={{ color: getC(memPct) }}>RAM {memPct}%</span>
                <TempBadge value={sv.temperature_c} size="sm" />
              </div>
            </div>
          )
        })}
      </div>
      {/* Main graph */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <KioskCarouselView servers={[s]} carouselSpeed={999999} />
      </div>
    </div>
  )
}

/** 5. Dynamic Cards View — FIXED: graph is inlined, not using KioskCarouselView */
function KioskDynamicCardsView({ servers, carouselSpeed }) {
  const [graphIdx, setGraphIdx] = useState(0)
  useEffect(() => {
    if (servers.length <= 1) return
    const i = setInterval(() => setGraphIdx(p => (p + 1) % servers.length), (carouselSpeed || 15) * 1000)
    return () => clearInterval(i)
  }, [servers.length, carouselSpeed])

  const focusServer = servers[graphIdx] || servers[0]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 16 }}>
      {/* Top: Dynamic masonry cards */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12, overflowY: 'auto', paddingRight: 4 }} className="custom-scrollbar">
        {servers.map(s => {
          const memPct = s.mem_total_mb ? Math.round(s.mem_used_mb / s.mem_total_mb * 100) : 0
          const isCritical = s.cpu_percent > 80 || s.status === 'offline' || s.status === 'degraded' || memPct > 85
          const isGraphFocus = s.id === focusServer?.id
          return (
            <div key={s.id} className={`server-card ${s.status}`} onClick={() => setGraphIdx(servers.indexOf(s))} style={{
              transform: 'none', cursor: 'pointer',
              gridColumn: isCritical ? 'span 2' : 'span 1',
              border: isGraphFocus ? '2px solid var(--accent)' : isCritical ? '2px solid var(--red)' : '1px solid var(--border)',
              boxShadow: isGraphFocus ? '0 0 20px rgba(100,200,255,0.3)' : isCritical ? '0 0 15px rgba(255,50,50,0.3)' : 'none',
              transition: 'all 0.3s ease'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <div className="server-label" style={{ fontSize: isCritical ? '1.5rem' : '1.1rem' }}>{s.label}</div>
                  {s.group_name && <div className="server-group">{s.group_name}</div>}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {isCritical && <span style={{ padding: '3px 8px', background: 'var(--red)', color: '#fff', borderRadius: 4, fontWeight: 'bold', fontSize: '0.7rem' }}>⚠ HIGH</span>}
                  <span className={`status-badge ${s.status}`}>{statusLabel[s.status]}</span>
                </div>
              </div>
              <TempBadge value={s.temperature_c} size={isCritical ? 'md' : 'sm'} />
              <div style={{ marginTop: 8 }}>
                {[['CPU', s.cpu_percent], ['RAM', memPct]].map(([n, v]) => (
                  <div className="metric-row" key={n}>
                    <div className="metric-label-row">
                      <span>{n}</span>
                      <span style={{ color: getC(v), fontSize: isCritical ? '1.2rem' : '0.9rem' }}>{typeof v === 'number' ? v.toFixed(1) : '—'}%</span>
                    </div>
                    <MetricBar value={v} height={isCritical ? 10 : 7} />
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Bottom: Focused graph — properly bounded */}
      {focusServer && (
        <div className="card" style={{ height: '35%', flexShrink: 0, display: 'flex', flexDirection: 'column', padding: 16, overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontWeight: 600 }}>📊 {focusServer.label} — 1-Hour History</div>
            <TempBadge value={focusServer.temperature_c} size="sm" />
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <ServerHistoryGraph serverId={focusServer.id} />
          </div>
        </div>
      )}
    </div>
  )
}

/** 6. Control Center View */
function KioskControlCenterView({ servers, alerts }) {
  const onlineCount = servers.filter(s => s.status === 'online').length
  const totalContainers = servers.reduce((a, s) => a + (s.container_count || 0), 0)
  const avgCpu = servers.length ? (servers.reduce((a, s) => a + (s.cpu_percent || 0), 0) / servers.length).toFixed(1) : '—'
  const avgTemp = (() => {
    const withTemp = servers.filter(s => typeof s.temperature_c === 'number')
    if (!withTemp.length) return null
    return (withTemp.reduce((a, s) => a + s.temperature_c, 0) / withTemp.length)
  })()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
      {/* Top KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, flexShrink: 0 }}>
        {[
          ['Fleet Size', servers.length, 'var(--text)'],
          ['Online', onlineCount, onlineCount === servers.length && servers.length > 0 ? 'var(--green)' : 'var(--orange)'],
          ['Containers', totalContainers, 'var(--blue)'],
          ['Avg CPU', `${avgCpu}%`, getC(parseFloat(avgCpu))],
          ['Threats', alerts.length, alerts.length > 0 ? 'var(--red)' : 'var(--green)'],
        ].map(([label, val, color]) => (
          <div key={label} className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px 0', border: label === 'Threats' && alerts.length > 0 ? '1px solid var(--red)' : '' }}>
            <div style={{ fontSize: '2.8rem', fontWeight: 800, color }}>{val}</div>
            <div style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, fontSize: '0.75rem' }}>{label}</div>
          </div>
        ))}
      </div>
      {avgTemp !== null && (
        <div style={{ textAlign: 'center', padding: '8px 0', background: 'var(--bg-surface)', borderRadius: 8, border: '1px solid var(--border)' }}>
          <span style={{ color: 'var(--text-muted)', marginRight: 12 }}>FLEET AVG TEMP</span>
          <TempBadge value={avgTemp} size="md" />
        </div>
      )}
      {/* Server Matrix */}
      <div className="card custom-scrollbar" style={{ flex: 1, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'monospace', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '0.75rem' }}>
              {['Server', 'Status', 'CPU', 'Temp', 'RAM', 'Disk', 'Load', 'Uptime'].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {servers.map(s => {
              const memPct = s.mem_total_mb ? Math.round(s.mem_used_mb / s.mem_total_mb * 100) : 0
              return (
                <tr key={s.id} style={{ borderBottom: '1px solid #1a1a2e' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 'bold', color: '#fff' }}>{s.label}</td>
                  <td style={{ padding: '10px 14px', color: statusColor[s.status] }}>{statusLabel[s.status]}</td>
                  <td style={{ padding: '10px 14px', color: getC(s.cpu_percent) }}>{typeof s.cpu_percent === 'number' ? s.cpu_percent.toFixed(1) : '—'}%</td>
                  <td style={{ padding: '10px 14px' }}><TempBadge value={s.temperature_c} size="sm" /></td>
                  <td style={{ padding: '10px 14px', color: getC(memPct) }}>{memPct}%</td>
                  <td style={{ padding: '10px 14px', color: getC(s.disk_percent) }}>{s.disk_percent?.toFixed(1) ?? '—'}%</td>
                  <td style={{ padding: '10px 14px', color: '#888' }}>{s.load_1?.toFixed(2) ?? '—'}</td>
                  <td style={{ padding: '10px 14px', color: '#888' }}>{Math.floor((s.uptime_secs || 0) / 86400)}d</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** 7. Logs (Alerts Terminal) View */
function KioskLogsView({ alerts }) {
  return (
    <div className="card" style={{ height: '100%', background: '#05070a', border: '1px solid #1a2535', display: 'flex', flexDirection: 'column', padding: 24 }}>
      <div style={{ color: '#00e5ff', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: 2, fontWeight: 'bold', marginBottom: 16 }}>
        &gt;_ Global Active Alerts Terminal
      </div>
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, fontFamily: 'monospace' }} className="custom-scrollbar">
        {alerts.length === 0 ? (
          <div style={{ color: '#00e5ff', opacity: 0.5 }}>No anomalies detected. All systems nominal.</div>
        ) : alerts.map(a => (
          <div key={a.id} style={{ display: 'flex', gap: 16, opacity: a.is_acknowledged ? 0.45 : 1, filter: a.is_acknowledged ? 'grayscale(0.7)' : 'none' }}>
            <div style={{ color: a.severity === 'critical' ? '#ff4444' : '#ffaa00', minWidth: 100, flexShrink: 0 }}>
              [{new Date(a.fired_at).toLocaleTimeString()}]
            </div>
            <div style={{ flex: 1, textDecoration: a.is_acknowledged ? 'line-through' : 'none' }}>
              <span style={{ color: '#fff', fontWeight: 'bold' }}>{a.title}</span>
              <span style={{ color: '#aaa', marginLeft: 12 }}>— {a.message}</span>
              {a.is_acknowledged && <span style={{ color: '#666', marginLeft: 12 }}>(ACK)</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** 8. NEW: Heatmap View — thermal overview of all servers */
function KioskHeatmapView({ servers }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', gap: 24, flexShrink: 0 }}>
        <span>Metric Heatmap — color intensity represents load</span>
        <span style={{ color: '#00e5ff' }}>■ Low</span>
        <span style={{ color: '#ffaa00' }}>■ Medium</span>
        <span style={{ color: '#ff4444' }}>■ Critical</span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }} className="custom-scrollbar">
        {servers.map(s => {
          const memPct = s.mem_total_mb ? Math.round(s.mem_used_mb / s.mem_total_mb * 100) : 0
          const metrics = [
            { name: 'CPU', value: s.cpu_percent },
            { name: 'RAM', value: memPct },
            { name: 'Disk', value: s.disk_percent },
          ]
          return (
            <div key={s.id} style={{ background: 'var(--bg-surface)', borderRadius: 10, padding: '14px 18px', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span className={`status-badge ${s.status}`}>{statusLabel[s.status]}</span>
                  <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>{s.label}</span>
                  {s.group_name && <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{s.group_name}</span>}
                </div>
                <TempBadge value={s.temperature_c} size="md" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {metrics.map(({ name, value }) => {
                  const color = getC(value)
                  const opacity = typeof value === 'number' ? 0.1 + (value / 100) * 0.7 : 0.1
                  return (
                    <div key={name} style={{
                      background: typeof value === 'number' ? color : 'var(--bg-base)',
                      opacity: typeof value === 'number' ? 0.8 : 0.3,
                      borderRadius: 8, padding: '12px 0', textAlign: 'center',
                      boxShadow: typeof value === 'number' && value > 60 ? `0 0 12px ${color}80` : 'none',
                      transition: 'all 0.5s ease'
                    }}>
                      <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#fff', textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
                        {typeof value === 'number' ? value.toFixed(0) : '—'}%
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase', letterSpacing: 1 }}>{name}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** 9. NEW: Fleet Tactical View — cinematic dark style with circular gauges-like bars */
function KioskTacticalView({ servers }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20, height: '100%', overflowY: 'auto' }} className="custom-scrollbar">
      {servers.map(s => {
        const memPct = s.mem_total_mb ? Math.round(s.mem_used_mb / s.mem_total_mb * 100) : 0
        const isOnline = s.status === 'online'
        return (
          <div key={s.id} style={{
            background: 'linear-gradient(135deg, var(--bg-surface), var(--bg-base))',
            border: `1px solid ${isOnline ? 'var(--accent)' : s.status === 'offline' ? 'var(--red)' : 'var(--border)'}`,
            borderRadius: 12,
            padding: '20px 24px',
            position: 'relative',
            overflow: 'hidden',
            boxShadow: isOnline ? '0 0 20px rgba(100,200,255,0.1)' : ''
          }}>
            {/* Background decoration */}
            <div style={{
              position: 'absolute', right: -20, top: -20,
              width: 100, height: 100, borderRadius: '50%',
              background: `radial-gradient(circle, ${statusColor[s.status]}22, transparent)`,
              pointerEvents: 'none'
            }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: '1.2rem', fontFamily: 'monospace', letterSpacing: 1 }}>{s.label.toUpperCase()}</div>
                {s.group_name && <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', letterSpacing: 2, textTransform: 'uppercase' }}>{s.group_name}</div>}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: statusColor[s.status], fontSize: '1.4rem' }}>
                  {s.status === 'online' ? '●' : s.status === 'degraded' ? '◐' : '○'}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{s.status}</div>
              </div>
            </div>
            {/* Temp prominent */}
            <div style={{ marginBottom: 14, padding: '8px 12px', background: 'rgba(0,0,0,0.3)', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: 1 }}>Temperature</span>
              <TempBadge value={s.temperature_c} size="md" />
            </div>
            {/* Metrics as glowing bars */}
            {[['CPU', s.cpu_percent], ['Memory', memPct], ['Disk', s.disk_percent]].map(([name, val]) => {
              const color = getC(val)
              return (
                <div key={name} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: '0.75rem', fontFamily: 'monospace' }}>
                    <span style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>{name}</span>
                    <span style={{ color, fontWeight: 700 }}>{typeof val === 'number' ? val.toFixed(1) : '?'}%</span>
                  </div>
                  <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', width: `${Math.min(100, val || 0)}%`,
                      background: `linear-gradient(90deg, ${color}88, ${color})`,
                      borderRadius: 3,
                      boxShadow: (val || 0) > 60 ? `0 0 8px ${color}` : 'none',
                      transition: 'width 0.6s ease'
                    }} />
                  </div>
                </div>
              )
            })}
            <div style={{ display: 'flex', gap: 8, marginTop: 14, fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
              <span>📦 {s.container_count ?? 0} Containers</span>
              <span>⏱ {Math.floor((s.uptime_secs || 0) / 86400)}d Uptime</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** 10. NEW: Minimal View — ultra-clean, high contrast status board */
function KioskMinimalView({ servers }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, height: '100%', overflowY: 'auto' }} className="custom-scrollbar">
      {servers.map((s, i) => {
        const memPct = s.mem_total_mb ? Math.round(s.mem_used_mb / s.mem_total_mb * 100) : 0
        const isOnline = s.status === 'online'
        return (
          <div key={s.id} style={{
            display: 'flex', alignItems: 'center', gap: 20,
            padding: '20px 24px',
            borderBottom: '1px solid var(--border)',
            background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)'
          }}>
            {/* Status dot */}
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: statusColor[s.status], flexShrink: 0, boxShadow: `0 0 8px ${statusColor[s.status]}` }} />
            {/* Name */}
            <div style={{ minWidth: 180 }}>
              <div style={{ fontWeight: 700, fontSize: '1rem' }}>{s.label}</div>
              {s.group_name && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{s.group_name}</div>}
            </div>
            {/* Temp */}
            <div style={{ minWidth: 90 }}><TempBadge value={s.temperature_c} size="sm" /></div>
            {/* Metrics */}
            {[['CPU', s.cpu_percent], ['RAM', memPct], ['Disk', s.disk_percent]].map(([name, val]) => (
              <div key={name} style={{ minWidth: 80 }}>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>{name}</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 800, color: getC(val) }}>{typeof val === 'number' ? val.toFixed(0) : '—'}%</div>
              </div>
            ))}
            {/* Bar for CPU */}
            <div style={{ flex: 1, display: 'flex', gap: 4, alignItems: 'center' }}>
              <MetricBar value={s.cpu_percent} height={6} />
            </div>
            {/* Uptime */}
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', minWidth: 70, textAlign: 'right' }}>
              {Math.floor((s.uptime_secs || 0) / 86400)}d {Math.floor(((s.uptime_secs || 0) % 86400) / 3600)}h
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** 11. NEW: Multi-Graph View — shows graph for every server simultaneously */
function KioskMultiGraphView({ servers }) {
  if (servers.length === 0) return <div style={{ color: 'var(--text-muted)', padding: 40 }}>No servers online.</div>

  const cols = servers.length <= 2 ? servers.length : servers.length <= 4 ? 2 : 3
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${cols}, 1fr)`,
      gap: 16,
      height: '100%',
      overflow: 'hidden'
    }}>
      {servers.map(s => {
        const memPct = s.mem_total_mb ? Math.round(s.mem_used_mb / s.mem_total_mb * 100) : 0
        return (
          <div key={s.id} className="card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, flexShrink: 0 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{s.label}</div>
                <span className={`status-badge ${s.status}`} style={{ fontSize: '0.7rem', padding: '2px 8px' }}>{statusLabel[s.status]}</span>
              </div>
              <div style={{ textAlign: 'right', fontSize: '0.8rem' }}>
                <TempBadge value={s.temperature_c} size="sm" />
                <div style={{ color: getC(s.cpu_percent), marginTop: 2 }}>CPU {typeof s.cpu_percent === 'number' ? s.cpu_percent.toFixed(1) : '—'}%</div>
                <div style={{ color: getC(memPct) }}>RAM {memPct}%</div>
              </div>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              <ServerHistoryGraph serverId={s.id} label="" />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── View Registry ────────────────────────────────────────────────────────────

const VIEW_DEFS = [
  { id: 'grid',       label: '⊞ Grid',      needsAlerts: false },
  { id: 'carousel',  label: '🎡 Carousel',  needsAlerts: false },
  { id: 'mixed',     label: '🌗 Mixed',     needsAlerts: false },
  { id: 'sidebar',   label: '📑 Sidebar',   needsAlerts: false },
  { id: 'dynamic',   label: '🔥 Dynamic',   needsAlerts: false },
  { id: 'tactical',  label: '🎯 Tactical',  needsAlerts: false },
  { id: 'heatmap',   label: '🌡 Heatmap',   needsAlerts: false },
  { id: 'multigraph',label: '📈 Graphs',    needsAlerts: false },
  { id: 'minimal',   label: '📋 Minimal',   needsAlerts: false },
  { id: 'control',   label: '📊 Control',   needsAlerts: true  },
  { id: 'logs',      label: '📟 Logs',      needsAlerts: true  },
]

const THEMES = {
  default: {},
  cyberpunk: { '--bg-base': '#050510', '--bg-surface': '#111122', '--border': '#e94560', '--accent': '#f9a826', '--text': '#fff', '--text-muted': '#f39c12', '--green': '#00ffcc', '--red': '#ff0055', '--blue': '#00d2ff', '--orange': '#ff9900' },
  matrix:   { '--bg-base': '#000000', '--bg-surface': '#030a03', '--border': '#003300', '--accent': '#00ff00', '--text': '#00ff00', '--text-muted': '#008800', '--green': '#00ff00', '--red': '#00ff00', '--blue': '#00ff00', '--orange': '#00ff00' },
  midnight: { '--bg-base': '#10002b', '--bg-surface': '#240046', '--border': '#3c096c', '--accent': '#e0aaff', '--text': '#fff', '--text-muted': '#c77dff', '--green': '#ff9e00', '--red': '#ff0a54', '--blue': '#4cc9f0', '--orange': '#ff6d00' },
  solar:    { '--bg-base': '#0d0a00', '--bg-surface': '#1a1400', '--border': '#4a3000', '--accent': '#ffcc00', '--text': '#ffe066', '--text-muted': '#cc8800', '--green': '#88ff44', '--red': '#ff4400', '--blue': '#44aaff', '--orange': '#ffaa00' },
  ocean:    { '--bg-base': '#00080f', '--bg-surface': '#001122', '--border': '#003355', '--accent': '#00cfff', '--text': '#ccefff', '--text-muted': '#557799', '--green': '#00ff88', '--red': '#ff3355', '--blue': '#00cfff', '--orange': '#ffaa44' },
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function KioskPage() {
  useWebSocket()
  const { servers, fetchServers } = useServersStore()
  const { alerts, fetchAlerts } = useAlertsStore()
  const [time, setTime] = useState(new Date())
  const [viewMode, setViewMode] = useState('grid')
  const [settingsOpen, setSettingsOpen] = useState(false)

  const [carouselSpeed, setCarouselSpeed] = useLocalStorage('hiver_kiosk_carouselSpeed', 15)
  const [autoRotate, setAutoRotate] = useLocalStorage('hiver_kiosk_autoRotate', false)
  const [rotateSpeed, setRotateSpeed] = useLocalStorage('hiver_kiosk_rotateSpeed', 60)
  const [activeViews, setActiveViews] = useLocalStorage('hiver_kiosk_activeViews', VIEW_DEFS.map(v => v.id))
  const [themeName, setThemeName] = useLocalStorage('hiver_kiosk_theme', 'default')

  useEffect(() => {
    if (!autoRotate || activeViews.length === 0) return
    const interval = setInterval(() => {
      setViewMode(prev => {
        const idx = activeViews.indexOf(prev)
        return activeViews[(idx === -1 ? 0 : idx + 1) % activeViews.length]
      })
    }, rotateSpeed * 1000)
    return () => clearInterval(interval)
  }, [autoRotate, rotateSpeed, activeViews])

  useEffect(() => {
    fetchServers(); fetchAlerts()
    const i1 = setInterval(fetchServers, 30000)
    const i2 = setInterval(fetchAlerts, 10000)
    const i3 = setInterval(() => setTime(new Date()), 1000)
    return () => { clearInterval(i1); clearInterval(i2); clearInterval(i3) }
  }, [])

  const unackAlerts = alerts.filter(a => !a.is_acknowledged)

  return (
    <div style={{ ...THEMES[themeName], height: '100vh', overflow: 'hidden', background: 'var(--bg-base)', display: 'flex', flexDirection: 'column' }}>
      {/* ── Header ── */}
      <div style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)', padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--accent)', textShadow: '0 0 10px rgba(100,200,255,0.6)', whiteSpace: 'nowrap' }}>🐝 HIVER</span>
          {/* View Buttons */}
          <div style={{ display: 'flex', background: 'var(--bg-base)', borderRadius: 20, padding: 3, flexWrap: 'wrap', gap: 2 }}>
            {VIEW_DEFS.map(v => (
              <button key={v.id}
                className={`btn btn-sm ${viewMode === v.id ? 'btn-primary' : 'btn-ghost'}`}
                style={{ borderRadius: 14, border: 'none', fontSize: '0.75rem', padding: '4px 10px' }}
                onClick={() => setViewMode(v.id)}
              >{v.label}</button>
            ))}
          </div>
          <button className="btn btn-ghost btn-sm" style={{ border: '1px solid var(--border)', fontSize: '0.8rem' }} onClick={() => setSettingsOpen(true)}>⚙️</button>
          <Link to="/" className="btn btn-ghost btn-sm" style={{ border: '1px solid var(--border)', fontSize: '0.8rem' }}>🚪 Exit</Link>
        </div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <span style={{ fontSize: '1rem', fontWeight: 600, color: unackAlerts.length > 0 ? 'var(--red)' : 'var(--green)', whiteSpace: 'nowrap' }}>
            {unackAlerts.length > 0 ? `⚠ ${unackAlerts.length} Alert${unackAlerts.length > 1 ? 's' : ''}` : '✓ All Clear'}
          </span>
          <span style={{ fontSize: '1.1rem', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{time.toLocaleTimeString()}</span>
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ display: 'flex', gap: 16, padding: 16, flex: 1, overflow: 'hidden', minHeight: 0 }}>
        {/* Main View Area */}
        <div style={{ flex: 3, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {viewMode === 'grid'        && <KioskGridView servers={servers} />}
          {viewMode === 'carousel'    && <KioskCarouselView servers={servers} carouselSpeed={carouselSpeed} />}
          {viewMode === 'mixed'       && <KioskMixedView servers={servers} carouselSpeed={carouselSpeed} />}
          {viewMode === 'sidebar'     && <KioskSidebarGraphView servers={servers} carouselSpeed={carouselSpeed} />}
          {viewMode === 'dynamic'     && <KioskDynamicCardsView servers={servers} carouselSpeed={carouselSpeed} />}
          {viewMode === 'tactical'    && <KioskTacticalView servers={servers} />}
          {viewMode === 'heatmap'     && <KioskHeatmapView servers={servers} />}
          {viewMode === 'multigraph'  && <KioskMultiGraphView servers={servers} />}
          {viewMode === 'minimal'     && <KioskMinimalView servers={servers} />}
          {viewMode === 'control'     && <KioskControlCenterView servers={servers} alerts={unackAlerts} />}
          {viewMode === 'logs'        && <KioskLogsView alerts={alerts} />}
        </div>

        {/* Alerts Sidebar */}
        <div style={{ flex: 1, minWidth: 300, maxWidth: 380, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 600, flexShrink: 0 }}>
            Active Alerts {unackAlerts.length > 0 && <span style={{ color: 'var(--red)', marginLeft: 8 }}>({unackAlerts.length})</span>}
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }} className="custom-scrollbar">
            {alerts.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>No active alerts.<br />All systems nominal.</div>
            ) : alerts.map(a => (
              <div key={a.id} style={{
                background: a.is_acknowledged ? 'rgba(128,128,128,0.08)' : 'rgba(255, 60, 60, 0.08)',
                borderLeft: `4px solid ${a.is_acknowledged ? '#444' : a.severity === 'critical' ? '#ff4444' : '#ffaa00'}`,
                padding: 12, borderRadius: 4,
                opacity: a.is_acknowledged ? 0.45 : 1,
                filter: a.is_acknowledged ? 'grayscale(0.7)' : 'none',
                transition: 'all 0.3s ease'
              }}>
                <div style={{ fontWeight: 600, marginBottom: 4, color: a.is_acknowledged ? '#888' : '#fff', fontSize: '0.9rem' }}>
                  {a.title} {a.is_acknowledged && <span style={{ fontSize: '0.7rem', fontWeight: 'normal', color: '#666' }}>(Ack)</span>}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>{a.message}</div>
                <div style={{ fontSize: '0.7rem', color: '#555', marginTop: 6 }}>{new Date(a.fired_at).toLocaleTimeString()}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Settings Modal ── */}
      {settingsOpen && (
        <div className="modal-backdrop" onClick={() => setSettingsOpen(false)}>
          <div className="card" style={{ width: 500, maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: 20 }}>⚙️ Kiosk Settings</h3>

            <div className="field-row">
              <label className="field-label">Theme</label>
              <select className="input" value={themeName} onChange={e => setThemeName(e.target.value)}>
                <option value="default">Default Blue</option>
                <option value="cyberpunk">Cyberpunk Neon</option>
                <option value="matrix">Matrix Green</option>
                <option value="midnight">Midnight Purple</option>
                <option value="solar">Solar Amber</option>
                <option value="ocean">Ocean Deep</option>
              </select>
            </div>

            <div className="field-row">
              <label className="field-label">Carousel / Graph Rotation Speed (sec)</label>
              <input type="number" className="input" value={carouselSpeed} onChange={e => setCarouselSpeed(Number(e.target.value))} min={5} max={300} />
            </div>

            <div className="field-row" style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
              <input type="checkbox" checked={autoRotate} onChange={e => setAutoRotate(e.target.checked)} style={{ width: 20, height: 20 }} />
              <div style={{ fontWeight: 600 }}>Auto-Rotate Views</div>
            </div>

            {autoRotate && (
              <>
                <div className="field-row" style={{ marginTop: 14 }}>
                  <label className="field-label">View Switch Interval (sec)</label>
                  <input type="number" className="input" value={rotateSpeed} onChange={e => setRotateSpeed(Number(e.target.value))} min={10} max={3600} />
                </div>
                <div className="field-row" style={{ marginTop: 14 }}>
                  <label className="field-label">Included Views</label>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
                    {VIEW_DEFS.map(v => (
                      <label key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
                        <input type="checkbox" checked={activeViews.includes(v.id)} onChange={e => {
                          if (e.target.checked) setActiveViews([...activeViews, v.id])
                          else setActiveViews(activeViews.filter(x => x !== v.id))
                        }} />
                        {v.label}
                      </label>
                    ))}
                  </div>
                </div>
              </>
            )}

            <button className="btn btn-primary" style={{ width: '100%', marginTop: 24 }} onClick={() => setSettingsOpen(false)}>Done</button>
          </div>
        </div>
      )}
    </div>
  )
}
