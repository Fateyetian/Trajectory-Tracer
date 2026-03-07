import { create } from 'zustand'

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

export const useStore = create((set, get) => ({
  // ── 核心数据 ──────────────────────────────────────────────────────────
  trajectories: [],
  currentTrajectory: null,
  statistics: null,
  sourceFiles: [],

  // ── UI 状态 ───────────────────────────────────────────────────────────
  loading: false,
  error: null,
  autoRefresh: false,
  autoRefreshInterval: null,
  lastReloadResult: null,

  // ── 筛选器 ────────────────────────────────────────────────────────────
  filters: {
    status: null,
    taskType: null,
    minSteps: null,
    maxSteps: null,
    sourceFile: null,
  },

  // ── 分页 ──────────────────────────────────────────────────────────────
  pagination: { skip: 0, limit: 50 },

  // ── 视图模式: 'list' | 'groups' | 'metrics' | 'prompts' ──────────────
  currentView: 'list',

  // ── 轨迹对比（逆合成） ─────────────────────────────────────────────────
  comparisonData: null,
  comparisonLoading: false,
  showComparison: false,

  // ── 任务分组（WebShop RL） ────────────────────────────────────────────
  trajectoryGroups: null,
  groupsLoading: false,
  selectedGroup: null,

  // ── 训练指标 ──────────────────────────────────────────────────────────
  trainingMetrics: null,
  metricsLoading: false,

  // ── Actions: 轨迹列表 ─────────────────────────────────────────────────
  fetchTrajectories: async () => {
    set({ loading: true, error: null })
    try {
      const { filters, pagination } = get()
      const params = new URLSearchParams({
        skip: pagination.skip,
        limit: pagination.limit,
        ...(filters.status && { status: filters.status }),
        ...(filters.taskType && { task_type: filters.taskType }),
        ...(filters.minSteps && { min_steps: filters.minSteps }),
        ...(filters.maxSteps && { max_steps: filters.maxSteps }),
        ...(filters.sourceFile && { source_file: filters.sourceFile }),
      })
      const response = await fetch(`${API_BASE}/trajectories?${params}`)
      if (!response.ok) throw new Error('Failed to fetch trajectories')
      set({ trajectories: await response.json(), loading: false })
    } catch (error) {
      set({ error: error.message, loading: false })
    }
  },

  fetchTrajectoryDetail: async (id) => {
    set({ loading: true, error: null })
    try {
      const response = await fetch(`${API_BASE}/trajectories/${id}`)
      if (!response.ok) throw new Error('Failed to fetch trajectory detail')
      set({ currentTrajectory: await response.json(), loading: false })
    } catch (error) {
      set({ error: error.message, loading: false })
    }
  },

  fetchStatistics: async () => {
    try {
      const response = await fetch(`${API_BASE}/statistics`)
      if (!response.ok) throw new Error('Failed to fetch statistics')
      set({ statistics: await response.json() })
    } catch (error) {
      console.error('Failed to fetch statistics:', error)
    }
  },

  fetchSourceFiles: async () => {
    try {
      const response = await fetch(`${API_BASE}/source-files`)
      if (!response.ok) return
      set({ sourceFiles: await response.json() })
    } catch (error) {
      console.error('Failed to fetch source files:', error)
    }
  },

  // ── Actions: 热重载 ───────────────────────────────────────────────────
  reloadData: async () => {
    set({ loading: true, error: null })
    try {
      const response = await fetch(`${API_BASE}/reload`, { method: 'POST' })
      if (!response.ok) throw new Error('Failed to reload data')
      const result = await response.json()
      set({ lastReloadResult: result })
      await get().fetchTrajectories()
      await get().fetchStatistics()
      set({ loading: false })
      return result
    } catch (error) {
      set({ error: error.message, loading: false })
      return null
    }
  },

  toggleAutoRefresh: () => {
    const { autoRefresh, autoRefreshInterval } = get()
    if (autoRefresh) {
      if (autoRefreshInterval) clearInterval(autoRefreshInterval)
      set({ autoRefresh: false, autoRefreshInterval: null })
    } else {
      const interval = setInterval(() => get().reloadData(), 15000)
      set({ autoRefresh: true, autoRefreshInterval: interval })
      get().reloadData()
    }
  },

  // ── Actions: 筛选器 ───────────────────────────────────────────────────
  setFilter: (key, value) => {
    set(state => ({
      filters: { ...state.filters, [key]: value },
      pagination: { ...state.pagination, skip: 0 },
    }))
  },

  clearFilters: () => {
    set({
      filters: { status: null, taskType: null, minSteps: null, maxSteps: null, sourceFile: null },
      pagination: { skip: 0, limit: 50 },
    })
  },

  setCurrentTrajectory: (trajectory) => set({ currentTrajectory: trajectory }),

  // ── Actions: 视图切换 ─────────────────────────────────────────────────
  setCurrentView: (view) => {
    set({ currentView: view })
    if (view === 'groups') get().fetchTrajectoryGroups()
    else if (view === 'metrics') get().fetchTrainingMetrics()
  },

  // ── Actions: 逆合成对比 ───────────────────────────────────────────────
  fetchComparison: async (targetMolecule) => {
    set({ comparisonLoading: true, showComparison: true, comparisonData: null })
    try {
      const params = new URLSearchParams({ target_molecule: targetMolecule })
      const response = await fetch(`${API_BASE}/molecules/compare?${params}`)
      if (!response.ok) throw new Error('Failed to fetch comparison data')
      set({ comparisonData: await response.json(), comparisonLoading: false })
    } catch (error) {
      set({ comparisonLoading: false, error: error.message })
    }
  },

  closeComparison: () => set({ showComparison: false, comparisonData: null }),

  // ── Actions: 任务分组 ─────────────────────────────────────────────────
  fetchTrajectoryGroups: async (source = 'webshop_rl') => {
    set({ groupsLoading: true })
    try {
      const params = source ? `?source=${source}` : ''
      const response = await fetch(`${API_BASE}/trajectory-groups${params}`)
      if (!response.ok) throw new Error('Failed to fetch trajectory groups')
      set({ trajectoryGroups: await response.json(), groupsLoading: false })
    } catch (error) {
      console.error('Failed to fetch trajectory groups:', error)
      set({ groupsLoading: false })
    }
  },

  setSelectedGroup: (group) => set({ selectedGroup: group }),

  // ── Actions: 训练指标 ─────────────────────────────────────────────────
  fetchTrainingMetrics: async () => {
    set({ metricsLoading: true })
    try {
      const response = await fetch(`${API_BASE}/training-metrics`)
      if (!response.ok) throw new Error('Failed to fetch training metrics')
      set({ trainingMetrics: await response.json(), metricsLoading: false })
    } catch (error) {
      console.error('Failed to fetch training metrics:', error)
      set({ metricsLoading: false })
    }
  },

  // ── Actions: 分页 ─────────────────────────────────────────────────────
  nextPage: () => set(state => ({
    pagination: { ...state.pagination, skip: state.pagination.skip + state.pagination.limit }
  })),

  prevPage: () => set(state => ({
    pagination: { ...state.pagination, skip: Math.max(0, state.pagination.skip - state.pagination.limit) }
  })),
}))
