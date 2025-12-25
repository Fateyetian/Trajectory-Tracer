import { create } from 'zustand'

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

export const useStore = create((set, get) => ({
  // 数据
  trajectories: [],
  currentTrajectory: null,
  statistics: null,

  // UI 状态
  loading: false,
  error: null,

  // 筛选器
  filters: {
    status: null,
    taskType: null,
    minSteps: null,
    maxSteps: null,
  },

  // 分页
  pagination: {
    skip: 0,
    limit: 50,
  },

  // 获取轨迹列表
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
      })

      const response = await fetch(`${API_BASE}/trajectories?${params}`)
      if (!response.ok) throw new Error('Failed to fetch trajectories')

      const data = await response.json()
      set({ trajectories: data, loading: false })
    } catch (error) {
      set({ error: error.message, loading: false })
    }
  },

  // 获取轨迹详情
  fetchTrajectoryDetail: async (id) => {
    set({ loading: true, error: null })
    try {
      const response = await fetch(`${API_BASE}/trajectories/${id}`)
      if (!response.ok) throw new Error('Failed to fetch trajectory detail')

      const data = await response.json()
      set({ currentTrajectory: data, loading: false })
    } catch (error) {
      set({ error: error.message, loading: false })
    }
  },

  // 获取统计信息
  fetchStatistics: async () => {
    try {
      const response = await fetch(`${API_BASE}/statistics`)
      if (!response.ok) throw new Error('Failed to fetch statistics')

      const data = await response.json()
      set({ statistics: data })
    } catch (error) {
      console.error('Failed to fetch statistics:', error)
    }
  },

  // 设置筛选器
  setFilter: (key, value) => {
    set(state => ({
      filters: { ...state.filters, [key]: value },
      pagination: { ...state.pagination, skip: 0 } // 重置分页
    }))
  },

  // 清除筛选器
  clearFilters: () => {
    set({
      filters: {
        status: null,
        taskType: null,
        minSteps: null,
        maxSteps: null,
      },
      pagination: { skip: 0, limit: 50 }
    })
  },

  // 设置当前轨迹
  setCurrentTrajectory: (trajectory) => {
    set({ currentTrajectory: trajectory })
  },

  // 分页
  nextPage: () => {
    set(state => ({
      pagination: {
        ...state.pagination,
        skip: state.pagination.skip + state.pagination.limit
      }
    }))
  },

  prevPage: () => {
    set(state => ({
      pagination: {
        ...state.pagination,
        skip: Math.max(0, state.pagination.skip - state.pagination.limit)
      }
    }))
  },
}))
