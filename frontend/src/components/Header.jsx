import { useState } from 'react'
import { useStore } from '../store'
import StatsPanel from './StatsPanel'

export default function Header() {
  const {
    statistics, reloadData, toggleAutoRefresh,
    autoRefresh, lastReloadResult, loading,
  } = useStore()
  const [showStats, setShowStats] = useState(false)

  return (
    <>
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          {/* 左侧：标题 */}
          <div>
            <h1 className="text-xl font-bold text-gray-900 leading-tight">Trajectory Viewer</h1>
            <p className="text-xs text-gray-400 mt-0.5">RetroEvo · RLVMR · WebShop Trajectories</p>
          </div>

          <div className="flex items-center gap-3">
            {/* 刷新控制 */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={reloadData}
                disabled={loading}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                  loading
                    ? 'border-gray-200 text-gray-400 cursor-not-allowed'
                    : 'border-blue-300 text-blue-700 hover:bg-blue-50 active:bg-blue-100'
                }`}
                title="重新加载数据源"
              >
                <svg
                  className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Reload
              </button>

              <button
                onClick={toggleAutoRefresh}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                  autoRefresh
                    ? 'border-green-400 bg-green-50 text-green-700'
                    : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
                title={autoRefresh ? '关闭自动刷新 (15s)' : '开启自动刷新 (15s)'}
              >
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  autoRefresh ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
                }`} />
                Auto
              </button>

              {lastReloadResult && lastReloadResult.delta > 0 && (
                <span className="text-xs text-green-600 font-medium bg-green-50 px-2 py-1 rounded">
                  +{lastReloadResult.delta} new
                </span>
              )}
            </div>

            {/* 统计卡片 */}
            {statistics && (
              <div className="flex gap-2">
                <div className="text-center bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg px-3 py-1.5 shadow-sm border border-blue-200 min-w-[52px]">
                  <div className="text-lg font-bold text-blue-700">{statistics.total}</div>
                  <div className="text-[10px] text-gray-500 leading-none mt-0.5">总轨迹</div>
                </div>
                <div className="text-center bg-gradient-to-br from-green-50 to-green-100 rounded-lg px-3 py-1.5 shadow-sm border border-green-200 min-w-[52px]">
                  <div className="text-lg font-bold text-green-700">
                    {statistics.by_status?.success || 0}
                  </div>
                  <div className="text-[10px] text-gray-500 leading-none mt-0.5">成功</div>
                </div>
                {(statistics.by_source?.webshop_rebel > 0 || statistics.by_source?.webshop_rl > 0) && (
                  <div className="text-center bg-gradient-to-br from-amber-50 to-amber-100 rounded-lg px-3 py-1.5 shadow-sm border border-amber-200 min-w-[52px]">
                    <div className="text-lg font-bold text-amber-700">
                      {(statistics.by_source?.webshop_rebel || 0) + (statistics.by_source?.webshop_rl || 0)}
                    </div>
                    <div className="text-[10px] text-gray-500 leading-none mt-0.5">WebShop</div>
                  </div>
                )}
                <div className="text-center bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg px-3 py-1.5 shadow-sm border border-purple-200 min-w-[52px]">
                  <div className="text-lg font-bold text-purple-700">{statistics.avg_steps}</div>
                  <div className="text-[10px] text-gray-500 leading-none mt-0.5">均步数</div>
                </div>
              </div>
            )}

            {/* 详细统计面板开关 */}
            <button
              onClick={() => setShowStats(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                showStats
                  ? 'bg-indigo-100 text-indigo-700 border-indigo-200'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border-gray-200'
              }`}
              title={showStats ? '收起详细统计' : '展开详细统计'}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              统计
            </button>
          </div>
        </div>
      </header>

      {/* 可折叠详细统计面板 */}
      {showStats && <StatsPanel visible={true} />}
    </>
  )
}
