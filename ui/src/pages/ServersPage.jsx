import React, { useEffect, useState } from 'react'
import { useServersStore } from '../store'
import { api } from '../store'
import { Link } from 'react-router-dom'

export default function ServersPage() {
  const { servers, fetchServers } = useServersStore()
  const [showAddCommand, setShowAddCommand] = useState(null)
  const [newLabel, setNewLabel] = useState('')
  const [connType, setConnType] = useState('push')
  const [agentUrl, setAgentUrl] = useState('')
  const [agentToken, setAgentToken] = useState('')
  const [addOpen, setAddOpen] = useState(false)

  const [editServer, setEditServer] = useState(null)
  const [editLabel, setEditLabel] = useState('')
  const [editGroup, setEditGroup] = useState('')

  useEffect(() => { fetchServers() }, [])

  const generateCmd = (label, type, token, port) => {
    if (type === 'pull') {
      return `docker run -d \\
  --name hiver-agent \\
  --restart unless-stopped \\
  -e SERVER_LABEL="${label}" \\
  -e AGENT_TOKEN="${token}" \\
  -e AGENT_PORT="${port}" \\
  -p ${port}:${port} \\
  -v /var/run/docker.sock:/var/run/docker.sock:ro \\
  -v /proc:/host/proc:ro \\
  --pid host \\
  osmanyahyaakinci/hiver-agent:latest`
    }
    const motherUrl = `${window.location.origin}`
    return `docker run -d \\
  --name hiver-agent \\
  --restart unless-stopped \\
  -e MOTHER_URL=${motherUrl} \\
  -e SERVER_LABEL="${label}" \\
  -v /var/run/docker.sock:/var/run/docker.sock:ro \\
  -v /proc:/host/proc:ro \\
  --pid host \\
  osmanyahyaakinci/hiver-agent:latest`
  }

  const handleAdd = async () => {
    if (!newLabel.trim()) return

    let tokenToUse = ''
    let portToUse = '8080'
    if (connType === 'pull') {
      if (!agentUrl.trim()) return alert("Agent URL is required for Pull mode")

      try {
        const { data } = await api.post('/servers', {
          label: newLabel.trim(),
          connection_type: 'pull',
          agent_url: agentUrl.trim(),
          token: agentToken.trim()
        })
        tokenToUse = data.token
        const u = new URL(agentUrl.trim())
        portToUse = u.port || (u.protocol === 'https:' ? '443' : '80')
        fetchServers()
      } catch (err) {
        alert("Failed to register pulling agent: " + (err.response?.data?.detail || err.message))
        return
      }
    }

    setShowAddCommand({ label: newLabel.trim(), type: connType, token: tokenToUse, port: portToUse })
    setAddOpen(false)
    setNewLabel('')
    setAgentUrl('')
    setAgentToken('')
  }

  const handleDelete = async (id) => {
    if (!confirm('Remove this server globally?')) return
    await api.delete(`/servers/${id}`).catch(console.error)
    fetchServers()
  }

  const handleEditSave = async () => {
    if (!editLabel.trim()) return alert("Label cannot be empty")
    try {
      await api.patch(`/servers/${editServer.id}`, {
        label: editLabel.trim(),
        group_name: editGroup.trim() || null
      })
      setEditServer(null)
      fetchServers()
    } catch (err) {
      alert("Failed to update server: " + (err.response?.data?.detail || err.message))
    }
  }

  return (
    <div className="page-content">
      <div className="flex items-center justify-between mb-4">
        <h1>Servers</h1>
        <button id="add-server-btn" className="btn btn-primary" onClick={() => setAddOpen(p => !p)}>+ Add Server</button>
      </div>

      {addOpen && (
        <div className="card mb-4">
          <h3 style={{ marginBottom: 12 }}>Add a New Server</h3>
          <div className="field-row">
            <label className="field-label">Connection Type</label>
            <select className="input" value={connType} onChange={e => setConnType(e.target.value)}>
              <option value="push">Push (Agent sends metrics to Mother)</option>
              <option value="pull">Pull (Mother fetches metrics from Agent)</option>
            </select>
          </div>
          <div className="field-row">
            <label className="field-label">Server Label *</label>
            <input id="server-label-input" className="input" placeholder="e.g. prod-web-01"
              value={newLabel} onChange={e => setNewLabel(e.target.value)} />
          </div>

          {connType === 'pull' && (
            <>
              <div className="field-row">
                <label className="field-label">Agent URL *</label>
                <input className="input" placeholder="e.g. http://10.10.10.5:8080"
                  value={agentUrl} onChange={e => setAgentUrl(e.target.value)} />
                <p className="field-hint">The URL Mother will use to reach the agent.</p>
              </div>
              <div className="field-row">
                <label className="field-label">Agent Token (Optional)</label>
                <input className="input" placeholder="Leave blank to auto-generate"
                  value={agentToken} onChange={e => setAgentToken(e.target.value)} />
                <p className="field-hint">A security token used to authenticate requests.</p>
              </div>
            </>
          )}

          <button className="btn btn-primary mt-4" onClick={handleAdd}>
            {connType === 'push' ? 'Generate Deploy Command' : 'Register & Generate Command'}
          </button>
        </div>
      )}

      {showAddCommand && (
        <div className="card mb-6" style={{ borderColor: 'var(--accent)' }}>
          <h3 style={{ marginBottom: 4 }}>Deploy Command for <span style={{ color: 'var(--accent)' }}>{showAddCommand.label}</span></h3>
          <p className="text-xs text-muted mb-4">Run this on the target server.</p>
          <pre className="log-raw" style={{ cursor: 'text', userSelect: 'all' }}>
            {generateCmd(showAddCommand.label, showAddCommand.type, showAddCommand.token, showAddCommand.port)}
          </pre>
          <button className="btn btn-ghost btn-sm mt-2" onClick={() => {
            navigator.clipboard.writeText(generateCmd(showAddCommand.label, showAddCommand.type, showAddCommand.token, showAddCommand.port))
          }}>📋 Copy</button>
        </div>
      )}

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Label</th><th>Group</th><th>Status</th><th>CPU</th><th>RAM</th><th>Last Seen</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {servers.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>No servers yet.</td></tr>
              )}
              {servers.map(s => (
                <tr key={s.id}>
                  <td>
                    <div className="flex items-center" style={{ gap: 8 }}>
                      <Link to={`/servers/${s.id}`} style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{s.label}</Link>
                      <span className="chip" style={{ fontSize: '0.65rem', padding: '2px 6px', background: s.connection_type === 'pull' ? 'var(--blue)' : 'var(--border)' }}>
                        {s.connection_type?.toUpperCase() || 'PUSH'}
                      </span>
                    </div>
                  </td>
                  <td className="text-xs text-muted">{s.group_name || '—'}</td>
                  <td><span className={`status-badge ${s.status}`}><span className="status-dot" />{s.status}</span></td>
                  <td>
                      <span style={{ color: getC(s.cpu_percent) }}>{typeof s.cpu_percent === 'number' ? s.cpu_percent.toFixed(1) : '—'}% {typeof s.temperature_c === 'number' ? `(${Math.round(s.temperature_c)}°C)` : ''}</span>
                  </td>
                  <td>{s.mem_total_mb ? `${Math.round(s.mem_used_mb / s.mem_total_mb * 100)}%` : '—'}</td>
                  <td className="text-xs text-muted">{s.last_seen ? new Date(s.last_seen).toLocaleString() : '—'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => {
                        setEditServer(s)
                        setEditLabel(s.label)
                        setEditGroup(s.group_name || '')
                      }}>✏️ Edit</button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(s.id)}>Remove</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Modal */}
      {editServer && (
        <div className="modal-backdrop" onClick={() => setEditServer(null)}>
          <div className="card" style={{ width: 400 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: 16 }}>Edit Server</h3>
            <div className="field-row">
              <label className="field-label">Server Label *</label>
              <input className="input" value={editLabel} onChange={e => setEditLabel(e.target.value)} />
            </div>
            <div className="field-row">
              <label className="field-label">Group Name (Optional)</label>
              <input className="input" placeholder="e.g. production, database" value={editGroup} onChange={e => setEditGroup(e.target.value)} />
            </div>
            <div className="flex justify-end mt-4">
              <button className="btn btn-primary" onClick={handleEditSave}>Save Changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function getC(pct) {
  if (!pct) return 'inherit'
  if (pct < 60) return 'var(--green)'
  if (pct < 85) return 'var(--orange)'
  return 'var(--red)'
}
