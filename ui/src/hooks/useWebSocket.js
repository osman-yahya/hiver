import { useEffect, useRef } from 'react'
import { useServersStore } from '../store'

export function useWebSocket() {
  const wsRef = useRef(null)
  const { updateServer } = useServersStore()

  useEffect(() => {
    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
      const ws = new WebSocket(`${protocol}://${window.location.host}/ws`)
      wsRef.current = ws

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          if (msg.type === 'metrics_update') {
            updateServer(msg.server_id, {
              status: msg.status,
              cpu_percent: msg.cpu_percent,
              mem_used_mb: msg.mem_used_mb,
              mem_total_mb: msg.mem_total_mb,
              disk_percent: msg.disk_percent,
            })
          }
        } catch {}
      }

      ws.onclose = () => {
        setTimeout(connect, 3000) // auto-reconnect
      }
    }
    connect()
    return () => wsRef.current?.close()
  }, [])
}
