import { useStore } from '../store'
import MessageBubble from './MessageBubble'
import RetrosynthesisTree from './retrosynthesis/RetrosynthesisTree'
import ExportMenu from './ExportMenu'

export default function TrajectoryViewer() {
  const { currentTrajectory, fetchComparison } = useStore()

  if (!currentTrajectory) return null

  const getStatusIcon = (status) =>
    status === 'success' ? '✅' : status === 'failed' ? '❌' : '❓'

  const isRetrosynthesis = currentTrajectory.task_type.startsWith('retrosynthesis')
  const isWebShop = currentTrajectory.task_type === 'webshop'
  const metadata = currentTrajectory.metadata || {}

  // 渐变背景：根据环境类型区分
  const headerGradient = isWebShop
    ? 'bg-gradient-to-r from-amber-50 to-orange-50'
    : isRetrosynthesis
      ? 'bg-gradient-to-r from-blue-50 to-indigo-50'
      : 'bg-gradient-to-r from-gray-50 to-slate-50'

  return (
    <div className="flex-1 flex flex-col bg-white overflow-hidden min-w-0">

      {/* ── 顶部信息卡片 ── */}
      <div className={`border-b border-gray-200 p-5 flex-shrink-0 ${headerGradient}`}>
        <div className="flex items-start justify-between gap-4">

          {/* 左侧：任务信息 */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="text-xl">{getStatusIcon(currentTrajectory.status)}</span>
              {isWebShop && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200 flex-shrink-0">
                  🛒 WebShop
                </span>
              )}
              {isRetrosynthesis && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800 border border-indigo-200 flex-shrink-0">
                  🧪 Retrosynthesis
                </span>
              )}
              <h2 className="text-base font-semibold text-gray-900 truncate">
                {currentTrajectory.task || '无任务描述'}
              </h2>
            </div>

            {/* WebShop 特有信息 */}
            {isWebShop && (
              <div className="flex items-center gap-2 flex-wrap mt-1">
                {metadata.item_id && (
                  <span className="text-xs text-gray-500 font-mono">ID: {metadata.item_id}</span>
                )}
                {metadata.annotation_success_rate !== undefined && (
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                    metadata.annotation_success_rate >= 0.9 ? 'bg-green-100 text-green-800'
                    : metadata.annotation_success_rate >= 0.5 ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-red-100 text-red-800'
                  }`}>
                    Annotation {(metadata.annotation_success_rate * 100).toFixed(0)}%
                  </span>
                )}
              </div>
            )}

            {/* 逆合成目标分子 */}
            {isRetrosynthesis && metadata.target_molecule && (
              <div className="bg-purple-50 border-l-4 border-purple-400 px-3 py-2 rounded mt-2">
                <div className="text-[10px] font-semibold text-purple-700 uppercase tracking-wide mb-0.5">
                  目标分子 (SMILES)
                </div>
                <div className="text-xs font-mono text-purple-900 break-all leading-relaxed">
                  {metadata.target_molecule}
                </div>
              </div>
            )}

            {/* 其他环境描述 */}
            {currentTrajectory.environment && !isRetrosynthesis && !isWebShop && (
              <div className="text-xs text-gray-600 bg-white/60 rounded p-2 mt-2 border border-gray-100">
                <span className="font-medium">🌍 环境：</span>
                <span className="whitespace-pre-wrap">{currentTrajectory.environment}</span>
              </div>
            )}
          </div>

          {/* 右侧：按钮组 + 指标卡片 */}
          <div className="flex items-start gap-2 flex-wrap justify-end flex-shrink-0">
            {/* 逆合成多轨迹对比按钮 */}
            {isRetrosynthesis && metadata.target_molecule && (
              <button
                onClick={() => fetchComparison(metadata.target_molecule)}
                className="self-start text-xs text-white bg-purple-500 hover:bg-purple-600 rounded-lg px-3 py-2 font-medium transition-colors shadow-sm whitespace-nowrap"
                title="查看同一目标分子的所有轨迹对比"
              >
                🔀 多轨迹对比
              </button>
            )}

            {/* 导出菜单 */}
            <ExportMenu trajectoryId={currentTrajectory.id} />

            {/* 指标卡片 */}
            <div className="flex gap-1.5 flex-wrap">
              <StatCard value={currentTrajectory.steps} label="总步数" color="blue" />

              {isWebShop ? (
                <>
                  <StatCard
                    value={currentTrajectory.messages.filter(m => m.metadata?.belief_json).length}
                    label="Beliefs" color="amber"
                  />
                  <StatCard
                    value={currentTrajectory.messages.filter(m => m.thought).length}
                    label="Reasoning" color="purple"
                  />
                </>
              ) : (
                <StatCard
                  value={currentTrajectory.messages.filter(m => m.thought).length}
                  label="思考次数" color="purple"
                />
              )}

              {isRetrosynthesis && (
                <>
                  <StatCard value={metadata.valid_steps || 0} label="有效步" color="green" />
                  <StatCard value={(metadata.total_reward || 0).toFixed(1)} label="奖励" color="orange" />
                  {currentTrajectory.status === 'success' && (
                    <StatCard value={metadata.pathway_length} label="路径长" color="blue" />
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── 对话消息区 ── */}
      <div className="flex-1 overflow-y-auto p-5">
        <div className="max-w-4xl mx-auto space-y-3">
          {currentTrajectory.messages.map((message, index) => (
            <MessageBubble
              key={index}
              message={message}
              index={index}
              isRetrosynthesis={isRetrosynthesis}
              isWebShop={isWebShop}
            />
          ))}
        </div>
      </div>

      {/* ── 逆合成路径树（成功轨迹） ── */}
      {isRetrosynthesis && currentTrajectory.status === 'success' && metadata.final_pathway?.length > 0 && (
        <RetrosynthesisTree
          targetMolecule={metadata.target_molecule}
          finalPathway={metadata.final_pathway}
        />
      )}
    </div>
  )
}

/** 小型指标卡片 */
function StatCard({ value, label, color = 'blue' }) {
  const colorMap = {
    blue:   'text-blue-700',
    purple: 'text-purple-700',
    green:  'text-green-700',
    orange: 'text-orange-600',
    amber:  'text-amber-700',
  }
  return (
    <div className="text-center bg-white rounded-lg px-3 py-2 shadow-sm border border-gray-100 min-w-[52px]">
      <div className={`text-xl font-bold ${colorMap[color] || colorMap.blue}`}>{value}</div>
      <div className="text-[10px] text-gray-400 mt-0.5 leading-none">{label}</div>
    </div>
  )
}
