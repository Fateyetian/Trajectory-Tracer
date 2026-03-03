import { useState } from 'react'
import { useStore } from '../store'

/** 纯 CSS 柱状图 */
function BarChart({ data, color }) {
  const maxVal = Math.max(...Object.values(data), 1)
  return (
    <div className="flex items-end gap-2 h-32">
      {Object.entries(data).map(([label, value]) => (
        <div key={label} className="flex-1 flex flex-col items-center gap-1">
          <span className="text-xs font-medium text-gray-600">{value}</span>
          <div
            className={`w-full rounded-t ${color}`}
            style={{ height: `${(value / maxVal) * 100}%`, minHeight: value > 0 ? '4px' : '0px' }}
          />
          <span className="text-xs text-gray-500 whitespace-nowrap">{label}</span>
        </div>
      ))}
    </div>
  )
}

/** 数字卡片 */
function StatCard({ label, value, sub, colorClass }) {
  return (
    <div className={`rounded-lg px-4 py-3 border ${colorClass}`}>
      <div className="text-2xl font-bold">{value}</div>
      {sub && <div className="text-xs text-gray-500">{sub}</div>}
      <div className="text-xs text-gray-600 mt-1">{label}</div>
    </div>
  )
}

/** task_type 的展示名和配色 */
const TYPE_CONFIG = {
  retrosynthesis_sft: {
    label: 'SFT',
    card: 'bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200 text-purple-700',
    bar: 'bg-purple-400',
  },
  retrosynthesis: {
    label: 'RL',
    card: 'bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200 text-blue-700',
    bar: 'bg-blue-400',
  },
}

function getConfig(taskType) {
  return TYPE_CONFIG[taskType] || {
    label: taskType,
    card: 'bg-gradient-to-br from-gray-50 to-gray-100 border-gray-200 text-gray-700',
    bar: 'bg-gray-400',
  }
}

export default function StatsPanel({ visible }) {
  const { statistics } = useStore()
  const detail = statistics?.by_task_type_detail
  const taskTypes = detail ? Object.keys(detail) : []

  const [activeTab, setActiveTab] = useState(null)
  // 自动选中第一个 tab
  const currentTab = activeTab && taskTypes.includes(activeTab) ? activeTab : taskTypes[0]

  if (!visible || !detail || taskTypes.length === 0) return null

  const current = detail[currentTab]
  const cfg = getConfig(currentTab)
  const successRate = current.count > 0 ? ((current.success_count / current.count) * 100).toFixed(1) : '0'

  return (
    <div className="bg-white border-b border-gray-200 px-6 py-4 animate-slideDown">
      {/* Tab 切换 */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-sm font-medium text-gray-500 mr-2">数据类型：</span>
        {taskTypes.map(tt => {
          const c = getConfig(tt)
          const isActive = tt === currentTab
          return (
            <button
              key={tt}
              onClick={() => setActiveTab(tt)}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                isActive
                  ? `${c.bar} text-white shadow-sm`
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {c.label} ({detail[tt].count})
            </button>
          )
        })}
      </div>

      {/* 数字卡片 */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <StatCard
          label="轨迹数量"
          value={current.count}
          colorClass={cfg.card}
        />
        <StatCard
          label="成功率"
          value={`${successRate}%`}
          sub={`${current.success_count} / ${current.count}`}
          colorClass={cfg.card}
        />
        <StatCard
          label="平均步数"
          value={current.avg_steps}
          colorClass={cfg.card}
        />
      </div>

      {/* 柱状图 */}
      <div className="grid grid-cols-2 gap-6">
        <div>
          <div className="text-sm font-medium text-gray-600 mb-2">步数分布</div>
          <BarChart data={current.steps_distribution} color={cfg.bar} />
        </div>
        <div>
          <div className="text-sm font-medium text-gray-600 mb-2">GT 路径长度分布</div>
          <BarChart data={current.pathway_length_distribution} color={cfg.bar} />
        </div>
      </div>
    </div>
  )
}
