import { useStore } from '../store'

export default function Header({ showStats, onToggleStats }) {
  const { statistics } = useStore()

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Trajectory Viewer</h1>
          <p className="text-sm text-gray-500 mt-1">RetroEvo Trajectories Visualization</p>
        </div>

        <div className="flex items-center gap-4">
          {statistics && (
            <div className="flex gap-6">
              <div className="text-center bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg px-4 py-2 shadow-sm border border-blue-200">
                <div className="text-2xl font-bold text-primary">{statistics.total}</div>
                <div className="text-xs text-gray-600 mt-1">总轨迹数</div>
              </div>
              <div className="text-center bg-gradient-to-br from-green-50 to-green-100 rounded-lg px-4 py-2 shadow-sm border border-green-200">
                <div className="text-2xl font-bold text-success">
                  {statistics.by_status?.success || 0}
                </div>
                <div className="text-xs text-gray-600 mt-1">成功</div>
              </div>
              <div className="text-center bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg px-4 py-2 shadow-sm border border-purple-200">
                <div className="text-2xl font-bold text-purple-600">{statistics.avg_steps}</div>
                <div className="text-xs text-gray-600 mt-1">平均步数</div>
              </div>
            </div>
          )}

          <button
            onClick={onToggleStats}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              showStats
                ? 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200'
            }`}
            title={showStats ? '收起统计面板' : '展开统计面板'}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            {showStats ? '收起' : '统计'}
          </button>
        </div>
      </div>
    </header>
  )
}
