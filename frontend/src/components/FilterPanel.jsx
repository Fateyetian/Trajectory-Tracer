import { useStore } from '../store'

export default function FilterPanel() {
  const { filters, setFilter, clearFilters, fetchTrajectories, sourceFiles } = useStore()

  const handleApply = () => fetchTrajectories()

  return (
    <div className="p-4 border-b border-gray-200 flex-shrink-0">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-700 text-sm">筛选器</h3>
        <button
          onClick={() => { clearFilters(); fetchTrajectories() }}
          className="text-xs text-blue-500 hover:text-blue-700 transition-colors"
        >
          清除
        </button>
      </div>

      <div className="space-y-2.5">
        {/* 状态 */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">状态</label>
          <select
            value={filters.status || ''}
            onChange={e => setFilter('status', e.target.value || null)}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400"
          >
            <option value="">全部</option>
            <option value="success">✅ 成功</option>
            <option value="failed">❌ 失败</option>
            <option value="unknown">❓ 未知</option>
          </select>
        </div>

        {/* 任务类型 */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">任务类型</label>
          <select
            value={filters.taskType || ''}
            onChange={e => setFilter('taskType', e.target.value || null)}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400"
          >
            <option value="">全部</option>
            <option value="webshop">🛒 WebShop</option>
            <option value="retrosynthesis">🧪 Retrosynthesis</option>
            <option value="retrosynthesis_sft">🧪 Retrosynthesis SFT</option>
            <option value="put">Put (放置)</option>
            <option value="clean">Clean (清洁)</option>
            <option value="cool">Cool (冷却)</option>
            <option value="heat">Heat (加热)</option>
            <option value="find">Find (寻找)</option>
            <option value="examine">Examine (检查)</option>
            <option value="use">Use (使用)</option>
            <option value="other">Other (其他)</option>
          </select>
        </div>

        {/* 步数范围 */}
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-500 mb-1">最小步数</label>
            <input
              type="number" min="0"
              value={filters.minSteps || ''}
              onChange={e => setFilter('minSteps', e.target.value ? parseInt(e.target.value) : null)}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400"
              placeholder="0"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-500 mb-1">最大步数</label>
            <input
              type="number" min="0"
              value={filters.maxSteps || ''}
              onChange={e => setFilter('maxSteps', e.target.value ? parseInt(e.target.value) : null)}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400"
              placeholder="∞"
            />
          </div>
        </div>

        {/* 来源文件（逆合成专用，有 sourceFiles 时显示） */}
        {sourceFiles && sourceFiles.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">来源文件</label>
            <select
              value={filters.sourceFile || ''}
              onChange={e => setFilter('sourceFile', e.target.value || null)}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400"
            >
              <option value="">全部</option>
              {sourceFiles.map(sf => (
                <option key={sf.source_file} value={sf.source_file}>
                  {sf.source_file} ({sf.count})
                </option>
              ))}
            </select>
          </div>
        )}

        <button
          onClick={handleApply}
          className="w-full bg-blue-600 text-white py-1.5 rounded-md hover:bg-blue-700 transition-colors text-sm font-medium"
        >
          应用筛选
        </button>
      </div>
    </div>
  )
}
