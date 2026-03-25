import React, { useEffect, useState } from 'react'
import { useLogsStore } from '../store'

export default function LogsPage() {
  const { logs, loading, fetchLogs } = useLogsStore()
  const [aiOnly, setAiOnly] = useState(false)
  const [showRaw, setShowRaw] = useState({})

  useEffect(() => { fetchLogs({ ai_only: aiOnly, limit: 100 }) }, [aiOnly])

  const toggleRaw = (id) => setShowRaw(p => ({ ...p, [id]: !p[id] }))

  return (
    <div className="page-content">
      <div className="flex items-center justify-between mb-4">
        <h1>Error Logs</h1>
        <div className="toggle-wrapper">
          <label className="toggle">
            <input type="checkbox" id="ai-only-toggle" checked={aiOnly} onChange={e => setAiOnly(e.target.checked)} />
            <span className="toggle-slider" />
          </label>
          <span className="text-sm text-muted">AI processed only</span>
        </div>
      </div>

      {loading && <div className="spinner" />}

      {!loading && logs.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">✅</div>
          <p>No error logs found. Your containers are looking healthy!</p>
        </div>
      )}

      {logs.map(log => (
        <div className="log-entry" key={log.id}>
          <div className="log-header">
            <span className="container-name">{log.container_name}</span>
            <span className="text-muted">·</span>
            <span>{log.server_id?.slice(0, 8)}</span>
            <span className="ml-auto">{new Date(log.recorded_at).toLocaleString()}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => toggleRaw(log.id)}>
              {showRaw[log.id] ? 'Hide raw' : 'Raw'}
            </button>
          </div>
          <div className="log-body">
            {(showRaw[log.id] || !log.ai_explanation) && (
              <div className="log-raw">{log.raw_log}</div>
            )}
            {log.ai_explanation && (
              <div className="log-ai">
                <div className="log-ai-label">🤖 AI Analysis</div>
                {log.ai_explanation}
              </div>
            )}
            {!log.ai_explanation && log.ai_processed && (
              <div className="text-xs text-muted mt-2">AI was disabled or unavailable — showing raw log.</div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
