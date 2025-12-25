import { useStore } from '../store'

export default function Header() {
  const { statistics } = useStore()

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Trajectory Viewer</h1>
          <p className="text-sm text-gray-500 mt-1">ALFWorld Agent Trajectories Visualization</p>
        </div>

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
      </div>

      {/* 任务类型分布 */}
      {statistics && statistics.by_task_type && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <h3 className="text-xs font-semibold text-gray-600 mb-2">任务类型分布</h3>
          <div className="flex gap-3 flex-wrap">
            {Object.entries(statistics.by_task_type)
              .sort((a, b) => b[1] - a[1])
              .map(([type, count]) => {
                const percentage = ((count / statistics.total) * 100).toFixed(1)
                const colors = {
                  put: 'bg-blue-100 text-blue-700 border-blue-300',
                  clean: 'bg-purple-100 text-purple-700 border-purple-300',
                  cool: 'bg-cyan-100 text-cyan-700 border-cyan-300',
                  heat: 'bg-orange-100 text-orange-700 border-orange-300',
                  find: 'bg-pink-100 text-pink-700 border-pink-300',
                  examine: 'bg-green-100 text-green-700 border-green-300',
                  use: 'bg-yellow-100 text-yellow-700 border-yellow-300',
                  other: 'bg-gray-100 text-gray-700 border-gray-300',
                  unknown: 'bg-gray-100 text-gray-500 border-gray-300'
                }
                const colorClass = colors[type] || colors.unknown

                return (
                  <div
                    key={type}
                    className={`px-3 py-1.5 rounded-full border text-xs font-medium ${colorClass}`}
                  >
                    <span className="font-semibold uppercase">{type}</span>
                    <span className="ml-1.5 opacity-75">{count}</span>
                    <span className="ml-1 opacity-60">({percentage}%)</span>
                  </div>
                )
              })}
          </div>
        </div>
      )}
    </header>
  )
}
