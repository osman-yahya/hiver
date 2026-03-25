import { create } from 'zustand'
import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('hiver_token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

export const useAuthStore = create((set) => ({
  user: null,
  token: localStorage.getItem('hiver_token'),
  login: async (username, password) => {
    const form = new URLSearchParams({ username, password })
    const { data } = await api.post('/auth/token', form)
    localStorage.setItem('hiver_token', data.access_token)
    set({ token: data.access_token, user: { username: data.username, role: data.role } })
    return data
  },
  logout: () => {
    localStorage.removeItem('hiver_token')
    set({ token: null, user: null })
  },
  fetchMe: async () => {
    try {
      const { data } = await api.get('/auth/me')
      set({ user: data })
    } catch {}
  }
}))

export const useServersStore = create((set, get) => ({
  servers: [],
  loading: false,
  fetchServers: async () => {
    set({ loading: true })
    try {
      const { data } = await api.get('/servers')
      set({ servers: data })
    } finally {
      set({ loading: false })
    }
  },
  updateServer: (id, patch) => {
    set(s => ({ servers: s.servers.map(srv => srv.id === id ? { ...srv, ...patch } : srv) }))
  },
}))

export const useLogsStore = create((set) => ({
  logs: [],
  loading: false,
  fetchLogs: async (params = {}) => {
    set({ loading: true })
    try {
      const { data } = await api.get('/logs', { params })
      set({ logs: data })
    } finally {
      set({ loading: false })
    }
  }
}))

export const useAlertsStore = create((set) => ({
  alerts: [],
  fetchAlerts: async () => {
    const { data } = await api.get('/alerts')
    set({ alerts: data })
  },
  acknowledge: async (id) => {
    await api.post(`/alerts/${id}/acknowledge`)
    set(s => ({ alerts: s.alerts.map(a => a.id === id ? { ...a, is_acknowledged: true } : a) }))
  }
}))

export const useSettingsStore = create((set) => ({
  settings: {},
  fetchSettings: async () => {
    const { data } = await api.get('/admin/settings')
    set({ settings: data })
  },
  updateSettings: async (patch) => {
    await api.patch('/admin/settings', patch)
    set(s => ({ settings: { ...s.settings, ...patch } }))
  }
}))

export { api }
