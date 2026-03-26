import React, { useEffect, useState } from 'react'
import { useSettingsStore } from '../store'
import { api } from '../store'

export default function AdminPage() {
  const { settings, fetchSettings, updateSettings } = useSettingsStore()
  const [localSettings, setLocalSettings] = useState({})
  const [saved, setSaved] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [testing, setTesting] = useState(false)
  const [users, setUsers] = useState([])
  const [newUserOpen, setNewUserOpen] = useState(false)
  const [newU, setNewU] = useState({ username: '', password: '', role: 'operator' })
  
  const [changePwOpen, setChangePwOpen] = useState(false)
  const [pw, setPw] = useState({ old_password: '', new_password: '' })

  useEffect(() => { fetchSettings(); fetchUsers() }, [])
  useEffect(() => { setLocalSettings(settings) }, [settings])

  const fetchUsers = async () => {
    try { const { data } = await api.get('/admin/users'); setUsers(data) } catch {}
  }

  const set = (key, value) => setLocalSettings(p => ({ ...p, [key]: value }))

  const handleSave = async () => {
    await updateSettings(localSettings)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const testOllama = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const { data } = await api.post('/admin/settings/test-ollama')
      setTestResult(data)
    } catch (e) {
      setTestResult({ ok: false, error: e.message })
    } finally {
      setTesting(false)
    }
  }

  const handleAddUser = async () => {
    if (!newU.username || !newU.password) return alert("Required fields missing")
    try {
      await api.post('/admin/users', newU)
      setNewUserOpen(false)
      setNewU({ username: '', password: '', role: 'operator' })
      fetchUsers()
    } catch (e) { alert(e.response?.data?.detail || e.message) }
  }

  const handleDeleteUser = async (id) => {
    if (!confirm("Delete user?")) return
    try {
      await api.delete(`/admin/users/${id}`)
      fetchUsers()
    } catch (e) { alert(e.response?.data?.detail || e.message) }
  }

  const handleChangePassword = async () => {
    if (!pw.old_password || !pw.new_password) return alert("Missing fields")
    try {
      await api.post('/auth/change-password', pw)
      alert("Password changed successfully!")
      setChangePwOpen(false)
      setPw({ old_password: '', new_password: '' })
    } catch (e) { alert(e.response?.data?.detail || e.message) }
  }

  return (
    <div className="page-content" style={{ maxWidth: 720 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>Administration</h1>
        <button className="btn btn-ghost" onClick={() => setChangePwOpen(true)} style={{ border: '1px solid var(--border)' }}>
          🔐 Change My Password
        </button>
      </div>

      {/* ── AI Engine ────────────────── */}
      <div className="settings-section">
        <h3>🤖 AI Engine (Ollama)</h3>

        <div className="field-row">
          <div className="toggle-wrapper">
            <label className="toggle">
              <input id="ai-enabled" type="checkbox"
                checked={localSettings.ai_enabled === 'true'}
                onChange={e => set('ai_enabled', e.target.checked ? 'true' : 'false')} />
              <span className="toggle-slider" />
            </label>
            <span className="field-label" style={{ margin: 0 }}>Enable AI Analysis</span>
          </div>
          <p className="field-hint">When enabled, error logs are sent to your Ollama instance for plain-English analysis.</p>
        </div>

        <div className="grid-2">
          <div className="field-row">
            <label className="field-label" htmlFor="ollama-url">Ollama API URL</label>
            <input id="ollama-url" className="input" placeholder="http://192.168.1.50:11434"
              value={localSettings.ollama_url || ''} onChange={e => set('ollama_url', e.target.value)} />
            <p className="field-hint">Base URL of your local Ollama server.</p>
          </div>
          <div className="field-row">
            <label className="field-label" htmlFor="ollama-model">Model Name</label>
            <input id="ollama-model" className="input" placeholder="llama3"
              value={localSettings.ollama_model || ''} onChange={e => set('ollama_model', e.target.value)} />
            <p className="field-hint">e.g. llama3, mistral, phi3</p>
          </div>
        </div>

        <div className="grid-2">
          <div className="field-row">
            <label className="field-label" htmlFor="ollama-timeout">Request Timeout (s)</label>
            <input id="ollama-timeout" type="number" className="input"
              value={localSettings.ollama_timeout_seconds || 30} onChange={e => set('ollama_timeout_seconds', e.target.value)} />
          </div>
          <div className="field-row">
            <label className="field-label" htmlFor="ollama-maxlen">Max Log Length (chars)</label>
            <input id="ollama-maxlen" type="number" className="input"
              value={localSettings.ollama_max_log_length || 4000} onChange={e => set('ollama_max_log_length', e.target.value)} />
          </div>
        </div>

        <div className="field-row">
          <label className="field-label" htmlFor="ollama-prompt">System Prompt</label>
          <textarea id="ollama-prompt" className="input" rows={3}
            value={localSettings.ollama_system_prompt || ''}
            onChange={e => set('ollama_system_prompt', e.target.value)}
            style={{ resize: 'vertical' }} />
          <p className="field-hint">Prepended to every log analysis request. Tailor the AI persona here.</p>
        </div>

        <div className="flex gap-3 items-center">
          <button id="test-ollama-btn" className="btn btn-ghost" onClick={testOllama} disabled={testing}>
            {testing ? 'Testing…' : '🔌 Test Connection'}
          </button>
          {testResult && (
            <span style={{ fontSize: '0.82rem', color: testResult.ok ? 'var(--green)' : 'var(--red)' }}>
              {testResult.ok
                ? `✓ Connected. Models: ${testResult.models?.join(', ') || 'none'}`
                : `✗ ${testResult.error}`}
            </span>
          )}
        </div>
      </div>

      {/* ── Global ────────────────── */}
      <div className="settings-section">
        <h3>⚙️ Global Settings</h3>
        <div className="grid-2">
          <div className="field-row">
            <label className="field-label" htmlFor="poll-interval">Poll Interval (s)</label>
            <input id="poll-interval" type="number" className="input"
              value={localSettings.poll_interval_seconds || 10}
              onChange={e => set('poll_interval_seconds', e.target.value)} />
            <p className="field-hint">How often agents send heartbeats.</p>
          </div>
          <div className="field-row">
            <label className="field-label" htmlFor="heartbeat-threshold">Heartbeat Miss Threshold</label>
            <input id="heartbeat-threshold" type="number" className="input"
              value={localSettings.heartbeat_miss_threshold || 3}
              onChange={e => set('heartbeat_miss_threshold', e.target.value)} />
            <p className="field-hint">Missed heartbeats before DOWN alert.</p>
          </div>
          <div className="field-row">
            <label className="field-label" htmlFor="retention-days">Metric Retention (days)</label>
            <input id="retention-days" type="number" className="input"
              value={localSettings.metric_retention_days || 7}
              onChange={e => set('metric_retention_days', e.target.value)} />
          </div>
        </div>
      </div>

      <button id="save-settings-btn" className="btn btn-primary" onClick={handleSave} style={{ padding: '10px 28px' }}>
        {saved ? '✓ Saved!' : 'Save Settings'}
      </button>

      {/* ── Users ────────────────── */}
      <div className="settings-section" style={{ marginTop: 40 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>👥 Users</h3>
          <button className="btn btn-primary btn-sm" onClick={() => setNewUserOpen(true)}>+ Add User</button>
        </div>
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Username</th><th>Role</th><th>Active</th><th>Created</th><th>Actions</th></tr></thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 600 }}>{u.username}</td>
                    <td><span className="chip" style={roleStyle(u.role)}>{u.role}</span></td>
                    <td>{u.is_active ? '✓' : '—'}</td>
                    <td className="text-xs text-muted">{new Date(u.created_at).toLocaleDateString()}</td>
                    <td>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDeleteUser(u.id)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {newUserOpen && (
        <div className="modal-backdrop" onClick={() => setNewUserOpen(false)}>
          <div className="card" style={{ width: 400 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: 16 }}>Create New User</h3>
            <div className="field-row">
              <label className="field-label">Username</label>
              <input className="input" value={newU.username} onChange={e => setNewU({...newU, username: e.target.value})} />
            </div>
            <div className="field-row">
              <label className="field-label">Password</label>
              <input className="input" type="password" value={newU.password} onChange={e => setNewU({...newU, password: e.target.value})} />
            </div>
            <div className="field-row">
              <label className="field-label">Role</label>
              <select className="input" value={newU.role} onChange={e => setNewU({...newU, role: e.target.value})}>
                <option value="admin">Admin</option>
                <option value="operator">Operator</option>
                <option value="kiosk">Kiosk Only</option>
              </select>
            </div>
            <div className="flex justify-end mt-4">
              <button className="btn btn-primary" onClick={handleAddUser}>Create User</button>
            </div>
          </div>
        </div>
      )}

      {changePwOpen && (
        <div className="modal-backdrop" onClick={() => setChangePwOpen(false)}>
          <div className="card" style={{ width: 400 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: 16 }}>Change Password</h3>
            <div className="field-row">
              <label className="field-label">Current Password</label>
              <input className="input" type="password" value={pw.old_password} onChange={e => setPw({...pw, old_password: e.target.value})} />
            </div>
            <div className="field-row">
              <label className="field-label">New Password</label>
              <input className="input" type="password" value={pw.new_password} onChange={e => setPw({...pw, new_password: e.target.value})} />
            </div>
            <div className="flex justify-end mt-4">
              <button className="btn btn-primary" onClick={handleChangePassword}>Update Password</button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

function roleStyle(role) {
  if (role === 'admin') return { background: 'var(--accent-dim)', color: 'var(--accent)' }
  if (role === 'kiosk') return { background: 'var(--purple-dim)', color: 'var(--purple)' }
  return { background: 'var(--blue-dim)', color: 'var(--blue)' }
}
