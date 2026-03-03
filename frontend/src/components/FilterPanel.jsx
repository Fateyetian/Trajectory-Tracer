import { useEffect } from 'react'
import { useStore } from '../store'

export default function FilterPanel() {
  const { filters, setFilter, clearFilters, fetchTrajectories, sourceFiles, fetchSourceFiles } = useStore()

  useEffect(() => {
    fetchSourceFiles()
  }, [])

  const handleApply = () => {
    fetchTrajectories()
  }

  const handleSelectFile = (sourceFile) => {
    const newValue = filters.sourceFile === sourceFile ? null : sourceFile
    setFilter('sourceFile', newValue)
  }

  const getSuccessRate = (file) => {
    if (file.count === 0) return 0
    return Math.round((file.success_count / file.count) * 100)
  }

  const getFileName = (fullPath) => {
    // 只取文件名部分，去掉路径
    return fullPath.split('/').pop().split('\\').pop()
  }

  return (
    <div className="border-b border-gray-200">
      {/* 数据文件分类 */}
      <div className="p-3 border-b border-gray-100">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">数据文件</h3>
          {filters.sourceFile && (
            <button
              onClick={() => {
                setFilter('sourceFile', null)
                fetchTrajectories()
              }}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              全部
            </button>
          )}
        </div>
        <div className="space-y-1">
          {sourceFiles.length === 0 ? (
            <div className="text-xs text-gray-400 py-1">加载中...</div>
          ) : (
            sourceFiles.map((file) => {
              const name = getFileName(file.source_file)
              const rate = getSuccessRate(file)
              const isActive = filters.sourceFile === file.source_file
              return (
                <button
                  key={file.source_file}
                  onClick={() => handleSelectFile(file.source_file)}
                  className={`w-full text-left px-2 py-2 rounded text-xs transition-colors ${
                    isActive
                      ? 'bg-blue-50 border border-blue-200 text-blue-800'
                      : 'hover:bg-gray-50 text-gray-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium truncate pr-1" title={name}>{name}</span>
                    <span className={`shrink-0 px-1.5 py-0.5 rounded-full text-xs font-medium ${
                      isActive ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {file.count.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="flex-1 bg-gray-200 rounded-full h-1">
                      <div
                        className="bg-green-400 h-1 rounded-full"
                        style={{ width: `${rate}%` }}
                      />
                    </div>
                    <span className="text-gray-400 shrink-0">{rate}%</span>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* 其他筛选器 */}
      <div className="p-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">筛选器</h3>
          <button
            onClick={() => {
              clearFilters()
              fetchTrajectories()
            }}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            清除
          </button>
        </div>

        <div className="space-y-2">
          {/* 状态筛选 */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">状态</label>
            <select
              value={filters.status || ''}
              onChange={(e) => setFilter('status', e.target.value || null)}
              className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">全部</option>
              <option value="success">成功</option>
              <option value="failed">失败</option>
              <option value="unknown">未知</option>
            </select>
          </div>

          {/* 任务类型筛选 */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">任务类型</label>
            <select
              value={filters.taskType || ''}
              onChange={(e) => setFilter('taskType', e.target.value || null)}
              className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">全部</option>
              <option value="retrosynthesis">逆合成 (RL)</option>
              <option value="retrosynthesis_sft">逆合成 SFT</option>
              <option value="put">Put</option>
              <option value="clean">Clean</option>
              <option value="cool">Cool</option>
              <option value="heat">Heat</option>
              <option value="find">Find</option>
              <option value="examine">Examine</option>
              <option value="use">Use</option>
              <option value="other">Other</option>
            </select>
          </div>

          {/* 步数范围 */}
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">最小步数</label>
              <input
                type="number"
                min="0"
                value={filters.minSteps || ''}
                onChange={(e) => setFilter('minSteps', e.target.value ? parseInt(e.target.value) : null)}
                className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="0"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">最大步数</label>
              <input
                type="number"
                min="0"
                value={filters.maxSteps || ''}
                onChange={(e) => setFilter('maxSteps', e.target.value ? parseInt(e.target.value) : null)}
                className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="∞"
              />
            </div>
          </div>

          <button
            onClick={handleApply}
            className="w-full bg-primary text-white py-1.5 rounded hover:bg-blue-600 transition-colors text-xs font-medium"
          >
            应用筛选
          </button>
        </div>
      </div>
    </div>
  )
}
