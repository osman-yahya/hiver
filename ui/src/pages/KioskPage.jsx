import React, { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useServersStore, useAlertsStore, api } from '../store'
import { useWebSocket } from '../hooks/useWebSocket'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, AreaChart, Area } from 'recharts'

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
  const [activeViews, setActiveViews] = useLocalStorage('hiver_kiosk_activeViews', ['grid', 'mixed', 'carousel', 'logs', 'sidebar', 'dynamic', 'control'])
  const [themeName, setThemeName] = useLocalStorage('hiver_kiosk_theme', 'default')

  const THEMES = {
    default: {},
    cyberpunk: { '--bg-base': '#050510', '--bg-surface': '#111122', '--border': '#e94560', '--accent': '#f9a826', '--text': '#fff', '--text-muted': '#f39c12', '--green': '#00ffcc', '--red': '#ff0055', '--blue': '#00d2ff', '--orange': '#ff9900' },
    matrix: { '--bg-base': '#000000', '--bg-surface': '#030a03', '--border': '#003300', '--accent': '#00ff00', '--text': '#00ff00', '--text-muted': '#008800', '--green': '#00ff00', '--red': '#00ff00', '--blue': '#00ff00', '--orange': '#00ff00' },
    midnight: { '--bg-base': '#10002b', '--bg-surface': '#240046', '--border': '#3c096c', '--accent': '#e0aaff', '--text': '#fff', '--text-muted': '#c77dff', '--green': '#ff9e00', '--red': '#ff0a54', '--blue': '#4cc9f0', '--orange': '#ff6d00' }
  }

  useEffect(() => {
    if (!autoRotate || activeViews.length === 0) return
    const interval = setInterval(() => {
      setViewMode(prev => {
        const currIdx = activeViews.indexOf(prev)
        const nextIdx = (currIdx === -1 ? 0 : currIdx + 1) % activeViews.length
        return activeViews[nextIdx]
      })
    }, rotateSpeed * 1000)
    return () => clearInterval(interval)
  }, [autoRotate, rotateSpeed, activeViews])

  useEffect(() => {
    fetchServers()
    fetchAlerts()
    const int1 = setInterval(fetchServers, 30000)
    const int2 = setInterval(fetchAlerts, 10000)
    const int3 = setInterval(() => setTime(new Date()), 1000)
    return () => { clearInterval(int1); clearInterval(int2); clearInterval(int3) }
  }, [])

  return (
    <div style={{ ...THEMES[themeName], height: '100vh', overflow: 'hidden', background: 'var(--bg-base)', padding: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--accent)', textShadow: '0 0 10px rgba(100,200,255,0.6)' }}>🐝 HIVER COMMAND CENTER</span>
          {/* Controls */}
          <div style={{ display: 'flex', background: 'var(--bg-base)', borderRadius: 20, padding: 4, ml: 4 }}>
            <button className={`btn btn-sm ${viewMode === 'grid' ? 'btn-primary' : 'btn-ghost'}`} style={{ borderRadius: 16, border: 'none' }} onClick={() => setViewMode('grid')}>⊞ Grid</button>
            <button className={`btn btn-sm ${viewMode === 'mixed' ? 'btn-primary' : 'btn-ghost'}`} style={{ borderRadius: 16, border: 'none' }} onClick={() => setViewMode('mixed')}>🌗 Mixed</button>
            <button className={`btn btn-sm ${viewMode === 'carousel' ? 'btn-primary' : 'btn-ghost'}`} style={{ borderRadius: 16, border: 'none' }} onClick={() => setViewMode('carousel')}>🎡 Carousel</button>
            <button className={`btn btn-sm ${viewMode === 'sidebar' ? 'btn-primary' : 'btn-ghost'}`} style={{ borderRadius: 16, border: 'none' }} onClick={() => setViewMode('sidebar')}>📑 Sidebar</button>
            <button className={`btn btn-sm ${viewMode === 'dynamic' ? 'btn-primary' : 'btn-ghost'}`} style={{ borderRadius: 16, border: 'none' }} onClick={() => setViewMode('dynamic')}>🔥 Dynamic</button>
            <button className={`btn btn-sm ${viewMode === 'control' ? 'btn-primary' : 'btn-ghost'}`} style={{ borderRadius: 16, border: 'none' }} onClick={() => setViewMode('control')}>📊 Control</button>
            <button className={`btn btn-sm ${viewMode === 'logs' ? 'btn-primary' : 'btn-ghost'}`} style={{ borderRadius: 16, border: 'none' }} onClick={() => setViewMode('logs')}>📟 Logs</button>
          </div>
          <button className="btn btn-ghost btn-sm" style={{ border: '1px solid var(--border)' }} onClick={() => setSettingsOpen(true)}>⚙️ Settings</button>
          <Link to="/" className="btn btn-ghost btn-sm" style={{ border: '1px solid var(--border)' }}>🚪 Exit Kiosk</Link>
        </div>
        <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
          <span style={{ fontSize: '1.1rem', fontWeight: 600, color: alerts.length > 0 ? 'var(--red)' : 'var(--green)' }}>
            {alerts.length} Active Alerts
          </span>
          <span style={{ fontSize: '1.2rem', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{time.toLocaleTimeString()}</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 20, padding: 24, flex: 1, overflow: 'hidden' }}>
        
        <div style={{ flex: 3, overflowY: 'auto', paddingRight: 10 }} className="custom-scrollbar">
          {viewMode === 'grid' && <KioskGridView servers={servers} />}
          {viewMode === 'mixed' && <KioskMixedView servers={servers} carouselSpeed={carouselSpeed} />}
          {viewMode === 'carousel' && <KioskCarouselView servers={servers} carouselSpeed={carouselSpeed} />}
          {viewMode === 'sidebar' && <KioskSidebarGraphView servers={servers} carouselSpeed={carouselSpeed} />}
          {viewMode === 'dynamic' && <KioskDynamicCardsView servers={servers} carouselSpeed={carouselSpeed} />}
          {viewMode === 'control' && <KioskControlCenterView servers={servers} alerts={alerts} />}
          {viewMode === 'logs' && <KioskLogsView alerts={alerts} />}
        </div>

        {/* Sidebar Alerts */}
        <div style={{ flex: 1, minWidth: 350, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: 16, borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: '1.1rem' }}>Active Alerts</div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {alerts.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>No active alerts.<br/>All systems nominal.</div>
            ) : (
              alerts.map(a => (
                <div key={a.id} style={{ background: 'rgba(255, 60, 60, 0.1)', borderLeft: `4px solid ${a.severity==='critical'?'#ff4444':'#ffaa00'}`, padding: 12, borderRadius: 4, opacity: a.is_acknowledged ? 0.4 : 1, filter: a.is_acknowledged ? 'grayscale(1)' : 'none' }}>
                  <div style={{ fontWeight: 600, marginBottom: 4, color: '#fff' }}>
                    {a.title} {a.is_acknowledged && <span style={{fontSize: '0.75rem', fontWeight: 'normal', color: 'var(--text-muted)'}}>(Ack)</span>}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>{a.message}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 8 }}>{new Date(a.fired_at).toLocaleTimeString()}</div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

      {settingsOpen && (
        <div className="modal-backdrop" onClick={() => setSettingsOpen(false)}>
          <div className="card" style={{ width: 450 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: 16 }}>Kiosk Configurations</h3>
            
            <div className="field-row">
              <label className="field-label">Carousel Rotation Speed (sec)</label>
              <input type="number" className="input" value={carouselSpeed} onChange={e => setCarouselSpeed(Number(e.target.value))} />
            </div>

            <div className="field-row">
              <label className="field-label">Kiosk Theme</label>
              <select className="input" value={themeName} onChange={e => setThemeName(e.target.value)}>
                <option value="default">Default Blue</option>
                <option value="cyberpunk">Cyberpunk Neon</option>
                <option value="matrix">Matrix Green</option>
                <option value="midnight">Midnight Purple</option>
              </select>
            </div>

            <div className="field-row" style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
              <input type="checkbox" checked={autoRotate} onChange={e => setAutoRotate(e.target.checked)} style={{ width: 20, height: 20 }} />
              <div style={{ fontWeight: 600 }}>Enable Auto-Rotation between Views</div>
            </div>

            {autoRotate && (
              <>
                <div className="field-row" style={{ marginTop: 16 }}>
                  <label className="field-label">View Change Interval (sec)</label>
                  <input type="number" className="input" value={rotateSpeed} onChange={e => setRotateSpeed(Number(e.target.value))} />
                </div>
                
                <div className="field-row" style={{ marginTop: 16 }}>
                  <label className="field-label">Included Views</label>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {['grid', 'mixed', 'carousel', 'sidebar', 'dynamic', 'control', 'logs'].map(v => (
                      <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 8, textTransform: 'capitalize' }}>
                        <input type="checkbox" checked={activeViews.includes(v)} onChange={e => {
                          if (e.target.checked) setActiveViews([...activeViews, v]);
                          else setActiveViews(activeViews.filter(x => x !== v));
                        }} />
                        {v}
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

function useLocalStorage(key, initialValue) {
  const [storedValue, setStoredValue] = useState(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      return initialValue;
    }
  });
  const setValue = value => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {}
  };
  return [storedValue, setValue];
}

const statusLabel = { online: '🟢 Online', degraded: '🟠 Degraded', offline: '🔴 Offline', unknown: '⚫ Unknown' }

function KioskGridView({ servers }) {
  return (
    <div className="servers-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))' }}>
      {servers.map(s => {
        const memPct = s.mem_total_mb ? Math.round(s.mem_used_mb / s.mem_total_mb * 100) : 0
        return (
          <div className={`server-card ${s.status}`} key={s.id} style={{ transform: 'none', cursor: 'default' }}>
            <div className="server-card-header">
              <div>
                <div className="server-label">{s.label}</div>
                {s.group_name && <div className="server-group">{s.group_name}</div>}
              </div>
              <span className={`status-badge ${s.status}`}>
                {statusLabel[s.status]}
              </span>
            </div>

            <div className="metric-row">
              <div className="metric-label-row">
                <span>CPU {typeof s.temperature_c === 'number' ? `(${Math.round(s.temperature_c)}°C)` : ''}</span>
                <span style={{ color: getC(s.cpu_percent) }}>{typeof s.cpu_percent === 'number' ? s.cpu_percent.toFixed(1) : '—'}%</span>
              </div>
              <div className="metric-bar-track"><div className="metric-bar-fill" style={{ width: `${Math.min(100, s.cpu_percent || 0)}%`, background: getC(s.cpu_percent) }} /></div>
            </div>

            <div className="metric-row">
              <div className="metric-label-row">
                <span>Memory</span>
                <span style={{ color: getC(memPct) }}>{memPct}%</span>
              </div>
              <div className="metric-bar-track"><div className="metric-bar-fill" style={{ width: `${Math.min(100, memPct || 0)}%`, background: getC(memPct) }} /></div>
            </div>

            <div className="metric-row">
              <div className="metric-label-row">
                <span>Disk</span>
                <span style={{ color: getC(s.disk_percent) }}>{s.disk_percent?.toFixed(1) ?? '—'}%</span>
              </div>
              <div className="metric-bar-track"><div className="metric-bar-fill" style={{ width: `${Math.min(100, s.disk_percent || 0)}%`, background: getC(s.disk_percent) }} /></div>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
              <div style={{ textAlign: 'center', background: 'var(--bg-base)', padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)' }}>
                <span style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{s.container_count ?? 0}</span>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>Containers</div>
              </div>
              <div style={{ textAlign: 'center', background: 'var(--bg-base)', padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)' }}>
                <span style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{s.uptime_secs ? Math.floor(s.uptime_secs/86400) : 0}d</span>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>Uptime</div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function getC(pct) {
  if (!pct) return 'var(--text-muted)'
  if (pct < 60) return 'var(--green)'
  if (pct < 85) return 'var(--orange)'
  return 'var(--red)'
}

function KioskCarouselView({ servers, carouselSpeed }) {
  const [idx, setIdx] = useState(0)
  const [history, setHistory] = useState([])

  useEffect(() => {
    if (servers.length === 0) return
    const interval = setInterval(() => {
      setIdx(prev => (prev + 1) % servers.length)
    }, (carouselSpeed || 15) * 1000)
    return () => clearInterval(interval)
  }, [servers.length, carouselSpeed])

  useEffect(() => {
    if (servers.length === 0) return
    const s = servers[idx]
    if (!s) return
    api.get(`/servers/${s.id}/history?hours=1`).then(res => setHistory(res.data)).catch(() => {})
  }, [idx, servers])

  if (servers.length === 0) {
    return <div style={{ textAlign: 'center', padding: 100, color: 'var(--text-muted)' }}>No servers online.</div>
  }

  const s = servers[idx]
  if (!s) return null

  const memPct = s.mem_total_mb ? Math.round(s.mem_used_mb / s.mem_total_mb * 100) : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 24, paddingBottom: 24 }}>
      {/* Top half: Focus Stats */}
      <div className={`server-card ${s.status}`} style={{ cursor: 'default', transform: 'none', display: 'flex', gap: 32, alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <div className="server-label" style={{ fontSize: '2.5rem' }}>{s.label}</div>
          {s.group_name && <div className="server-group" style={{ fontSize: '1.2rem' }}>{s.group_name}</div>}
          <div style={{ marginTop: 16 }}>
            <span className={`status-badge ${s.status}`} style={{ fontSize: '1.2rem', padding: '8px 16px' }}>
              {statusLabel[s.status]}
            </span>
          </div>
        </div>

        <div style={{ flex: 2, display: 'flex', gap: 32, justifyContent: 'space-around' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', fontWeight: 800, color: getC(s.cpu_percent) }}>{s.cpu_percent?.toFixed(1) ?? '—'}%</div>
            <div style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>CPU</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', fontWeight: 800, color: getC(memPct) }}>{memPct}%</div>
            <div style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>RAM</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', fontWeight: 800, color: getC(s.disk_percent) }}>{s.disk_percent?.toFixed(1) ?? '—'}%</div>
            <div style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Disk</div>
          </div>
        </div>
      </div>
      
      {/* Bottom half: Graph */}
      <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 400 }}>
        <h3 style={{ marginBottom: 16 }}>1-Hour History: {s.label}</h3>
        <div style={{ flex: 1, minHeight: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={history} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00e5ff" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#00e5ff" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorMem" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#b14bff" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#b14bff" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
              <XAxis dataKey="t" tickFormatter={t => { const d = new Date(t); return `${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}` }} stroke="var(--text-muted)" />
              <YAxis stroke="var(--text-muted)" domain={[0, 100]} />
              <Tooltip 
                contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, color: '#fff' }}
                labelFormatter={l => new Date(l).toLocaleTimeString()} 
              />
              <Area type="monotone" dataKey="cpu" name="CPU %" stroke="#00e5ff" fillOpacity={1} fill="url(#colorCpu)" />
              <Area type="monotone" dataKey="mem" name="Mem %" stroke="#b14bff" fillOpacity={1} fill="url(#colorMem)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

function KioskMixedView({ servers, carouselSpeed }) {
  return (
    <div style={{ display: 'flex', gap: 24, height: '100%' }}>
      <div style={{ flex: 1.5, overflow: 'hidden' }}>
        <KioskCarouselView servers={servers} carouselSpeed={carouselSpeed} />
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }} className="custom-scrollbar">
        <KioskGridView servers={servers} />
      </div>
    </div>
  )
}

function KioskLogsView({ alerts }) {
  return (
    <div className="card" style={{ height: '100%', background: '#0a0a0a', border: '1px solid #333', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '0 0 16px', borderBottom: '1px solid #333', color: '#00e5ff', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 'bold' }}>
        &gt;_ Global Active Alerts Terminal
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 0', display: 'flex', flexDirection: 'column', gap: 12, fontFamily: 'monospace' }} className="custom-scrollbar">
        {alerts.length === 0 ? (
          <div style={{ color: '#00e5ff', opacity: 0.5 }}>No anomalies detected. Awaiting telemetry...</div>
        ) : (
          alerts.map(a => (
            <div key={a.id} style={{ display: 'flex', gap: 16 }}>
              <div style={{ color: a.severity === 'critical' ? '#ff4444' : '#ffaa00', minWidth: 100 }}>
                [{new Date(a.fired_at).toLocaleTimeString()}]
              </div>
              <div style={{ flex: 1, textDecoration: a.is_acknowledged ? 'line-through' : 'none', opacity: a.is_acknowledged ? 0.5 : 1 }}>
                <span style={{ color: '#fff', fontWeight: 'bold' }}>{a.title}</span>
                <span style={{ color: '#aaa', marginLeft: 12 }}>— {a.message}</span>
                {a.is_acknowledged && <span style={{ color: '#888', fontStyle: 'italic', marginLeft: 12 }}>(Acknowledged)</span>}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ==========================================
// PHASE 2 ADVANCED VIEWS
// ==========================================

function KioskSidebarGraphView({ servers, carouselSpeed }) {
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    if (servers.length === 0) return
    const interval = setInterval(() => {
      setIdx(prev => (prev + 1) % servers.length)
    }, (carouselSpeed || 15) * 1000)
    return () => clearInterval(interval)
  }, [servers.length, carouselSpeed])

  if (servers.length === 0) return <div style={{ color: 'var(--text-muted)', padding: 40 }}>No servers online.</div>

  return (
    <div style={{ display: 'flex', height: '100%', gap: 24 }}>
      {/* Sidebar List */}
      <div style={{ width: 320, display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', paddingRight: 8 }} className="custom-scrollbar">
        {servers.map((s, i) => {
          const isActive = i === idx
          return (
            <div key={s.id} onClick={() => setIdx(i)} style={{ 
              padding: '16px 20px', 
              borderRadius: 8, 
              cursor: 'pointer',
              background: isActive ? 'var(--bg-surface)' : 'transparent',
              border: isActive ? '1px solid var(--accent)' : '1px solid var(--border)',
              boxShadow: isActive ? '0 0 15px rgba(100, 200, 255, 0.2)' : 'none',
              transition: 'all 0.3s ease'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontWeight: 'bold', fontSize: '1.2rem', color: isActive ? '#fff' : 'var(--text)' }}>{s.label}</div>
                <div style={{ fontSize: '0.8rem', color: isActive ? 'var(--accent)' : 'var(--text-muted)' }}>{statusLabel[s.status]}</div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                <span>CPU: <span style={{ color: getC(s.cpu_percent) }}>{typeof s.cpu_percent === 'number' ? s.cpu_percent.toFixed(1) : '—'}% {typeof s.temperature_c === 'number' ? `(${Math.round(s.temperature_c)}°C)` : ''}</span></span>
                <span>RAM: <span style={{ color: getC(s.mem_total_mb ? Math.round(s.mem_used_mb / s.mem_total_mb * 100) : 0) }}>{s.mem_total_mb ? Math.round(s.mem_used_mb / s.mem_total_mb * 100) : 0}%</span></span>
              </div>
            </div>
          )
        })}
      </div>
      
      {/* Main Focus Graph */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <KioskCarouselView servers={[servers[idx]]} carouselSpeed={999999} />
      </div>
    </div>
  )
}

function KioskDynamicCardsView({ servers, carouselSpeed }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, height: '100%' }}>
      {/* Top half: Masonry Grid highlighting big servers */}
      <div style={{ flex: 2, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, overflowY: 'auto', paddingRight: 8 }} className="custom-scrollbar">
        {servers.map(s => {
          const memPct = s.mem_total_mb ? Math.round(s.mem_used_mb / s.mem_total_mb * 100) : 0
          const isCritical = (s.cpu_percent > 80 || s.status === 'offline' || s.status === 'degraded' || memPct > 85)
          
          return (
            <div className={`server-card ${s.status}`} key={s.id} style={{ 
              transform: 'none', cursor: 'default', 
              gridColumn: isCritical ? 'span 2' : 'span 1',
              gridRow: isCritical ? 'span 2' : 'span 1',
              border: isCritical ? '2px solid var(--red)' : '1px solid var(--border)',
              background: isCritical ? 'url("data:image/svg+xml,%3Csvg width=\'40\' height=\'40\' viewBox=\'0 0 40 40\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M0 40L40 0H20L0 20M40 40V20L20 40\' fill=\'%23ff0000\' fill-opacity=\'0.03\' fill-rule=\'evenodd\'/%3E%3C/svg%3E") var(--bg-surface)' : 'var(--bg-surface)'
            }}>
              <div className="server-card-header" style={{ marginBottom: isCritical ? 24 : 16 }}>
                <div>
                  <div className="server-label" style={{ fontSize: isCritical ? '2rem' : '1.2rem' }}>{s.label}</div>
                  {s.group_name && <div className="server-group">{s.group_name}</div>}
                </div>
                {isCritical && <span style={{ padding: '4px 12px', background: 'var(--red)', color: '#fff', borderRadius: 4, fontWeight: 'bold', fontSize: '0.8rem', animation: 'pulse 2s infinite' }}>HOT</span>}
                <span className={`status-badge ${s.status}`}>
                  {statusLabel[s.status]}
                </span>
              </div>

              <div className="metric-row">
                <div className="metric-label-row">
                  <span>CPU {typeof s.temperature_c === 'number' ? `(${Math.round(s.temperature_c)}°C)` : ''}</span>
                  <span style={{ color: getC(s.cpu_percent), fontSize: isCritical ? '1.5rem' : '1rem' }}>{typeof s.cpu_percent === 'number' ? s.cpu_percent.toFixed(1) : '—'}%</span>
                </div>
                <div className="metric-bar-track" style={{ height: isCritical ? 12 : 8 }}><div className="metric-bar-fill" style={{ width: `${Math.min(100, s.cpu_percent || 0)}%`, background: getC(s.cpu_percent) }} /></div>
              </div>

              <div className="metric-row">
                <div className="metric-label-row">
                  <span>Memory</span>
                  <span style={{ color: getC(memPct), fontSize: isCritical ? '1.5rem' : '1rem' }}>{memPct}%</span>
                </div>
                <div className="metric-bar-track" style={{ height: isCritical ? 12 : 8 }}><div className="metric-bar-fill" style={{ width: `${Math.min(100, memPct || 0)}%`, background: getC(memPct) }} /></div>
              </div>

            </div>
          )
        })}
      </div>

      {/* Bottom half: Rotating Graph */}
      <div style={{ flex: 1.5, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <KioskCarouselView servers={servers} carouselSpeed={carouselSpeed} />
      </div>
    </div>
  )
}

function KioskControlCenterView({ servers, alerts }) {
  const onlineCount = servers.filter(s => s.status === 'online').length
  const totalContainers = servers.reduce((acc, s) => acc + (s.container_count || 0), 0)
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, height: '100%' }}>
      {/* Top Counters */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 0' }}>
          <div style={{ fontSize: '3.5rem', fontWeight: 800, color: 'var(--text)' }}>{servers.length}</div>
          <div style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Fleet Size</div>
        </div>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 0' }}>
          <div style={{ fontSize: '3.5rem', fontWeight: 800, color: onlineCount === servers.length && servers.length > 0 ? 'var(--green)' : 'var(--orange)' }}>{onlineCount}</div>
          <div style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Nodes Online</div>
        </div>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 0' }}>
          <div style={{ fontSize: '3.5rem', fontWeight: 800, color: 'var(--blue)' }}>{totalContainers}</div>
          <div style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Running Containers</div>
        </div>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 0', border: alerts.length > 0 ? '1px solid var(--red)' : '' }}>
          <div style={{ fontSize: '3.5rem', fontWeight: 800, color: alerts.length > 0 ? 'var(--red)' : 'var(--green)' }}>{alerts.length}</div>
          <div style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Active Threats</div>
        </div>
      </div>

      {/* Dense Matrix */}
      <div className="card custom-scrollbar" style={{ flex: 2, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontFamily: 'monospace' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
              <th style={{ padding: '12px 16px' }}>SERVER</th>
              <th style={{ padding: '12px 16px' }}>STATUS</th>
              <th style={{ padding: '12px 16px' }}>CPU</th>
              <th style={{ padding: '12px 16px' }}>MEM</th>
              <th style={{ padding: '12px 16px' }}>DISK</th>
              <th style={{ padding: '12px 16px' }}>SYS LOAD</th>
              <th style={{ padding: '12px 16px' }}>UPTIME</th>
            </tr>
          </thead>
          <tbody>
            {servers.map(s => {
              const memPct = s.mem_total_mb ? Math.round(s.mem_used_mb / s.mem_total_mb * 100) : 0
              return (
                <tr key={s.id} style={{ borderBottom: '1px solid #222' }}>
                  <td style={{ padding: '12px 16px', fontWeight: 'bold' }}>{s.label}</td>
                  <td style={{ padding: '12px 16px' }}>{statusLabel[s.status]}</td>
                  <td style={{ padding: '12px 16px', color: getC(s.cpu_percent) }}>{s.cpu_percent?.toFixed(1) ?? '—'}%</td>
                  <td style={{ padding: '12px 16px', color: getC(memPct) }}>{memPct}%</td>
                  <td style={{ padding: '12px 16px', color: getC(s.disk_percent) }}>{s.disk_percent?.toFixed(1) ?? '—'}%</td>
                  <td style={{ padding: '12px 16px', color: '#888' }}>{s.load_1?.toFixed(2)} / {s.load_5?.toFixed(2)}</td>
                  <td style={{ padding: '12px 16px', color: '#888' }}>{Math.floor((s.uptime_secs || 0)/86400)}d</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
