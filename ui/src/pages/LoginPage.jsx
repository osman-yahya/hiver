import React, { useState } from 'react'
import { useAuthStore } from '../store'

export default function LoginPage() {
  const { login } = useAuthStore()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(username, password)
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <span className="bee">🐝</span>
          <h1>Hiver</h1>
          <p>Server Monitoring Dashboard</p>
        </div>
        {error && <div className="login-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="field-row">
            <label className="field-label">Username</label>
            <input
              id="login-username"
              className="input"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoFocus
              required
            />
          </div>
          <div className="field-row" style={{ marginBottom: 20 }}>
            <label className="field-label">Password</label>
            <input
              id="login-password"
              type="password"
              className="input"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>
          <button id="login-submit" type="submit" className="btn btn-primary w-full" disabled={loading}
            style={{ justifyContent: 'center', padding: '10px' }}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
