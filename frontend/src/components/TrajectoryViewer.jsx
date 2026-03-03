import { useStore } from '../store'
import MessageBubble from './MessageBubble'
import RetrosynthesisTree from './retrosynthesis/RetrosynthesisTree'

export default function TrajectoryViewer() {
  const { currentTrajectory, fetchComparison } = useStore()

  if (!currentTrajectory) return null

  const getStatusIcon = (status) => {
    return status === 'success' ? '✅' : status === 'failed' ? '❌' : '❓'
  }

  const isRetrosynthesis = currentTrajectory.task_type.startsWith('retrosynthesis')
  const metadata = currentTrajectory.metadata || {}

  return (
    <div className="flex-1 flex flex-col bg-white overflow-hidden min-w-0">
      {/* 任务信息卡片 */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-gray-200 p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl">{getStatusIcon(currentTrajectory.status)}</span>
              <h2 className="text-xl font-bold text-gray-900">
                {currentTrajectory.task || '无任务描述'}
              </h2>
            </div>

            {/* 逆合成轨迹特有信息 */}
            {isRetrosynthesis && metadata.target_molecule && (
              <div className="bg-purple-50 border-l-4 border-purple-400 p-3 rounded mt-3">
                <div className="text-xs font-semibold text-purple-800 mb-1">🧪 目标分子 (SMILES)</div>
                <div className="text-xs font-mono text-purple-900 break-all">
                  {metadata.target_molecule}
                </div>
              </div>
            )}

            {currentTrajectory.environment && !isRetrosynthesis && (
              <div className="text-sm text-gray-600 bg-white/50 rounded p-3 mt-3">
                <div className="font-medium mb-1">🌍 环境描述:</div>
                <div className="whitespace-pre-wrap">{currentTrajectory.environment}</div>
              </div>
            )}
          </div>

          <div className="flex gap-4 ml-4 flex-wrap justify-end">
            {/* 逆合成轨迹：对比按钮 */}
            {isRetrosynthesis && metadata.target_molecule && (
              <button
                onClick={() => fetchComparison(metadata.target_molecule)}
                className="self-start text-sm text-white bg-purple-500 hover:bg-purple-600 border border-purple-500 rounded-lg px-4 py-2 font-medium transition-colors shadow-sm"
                title="查看同一目标分子的所有轨迹对比"
              >
                🔀 多轨迹对比
              </button>
            )}
            <div className="text-center bg-white rounded-lg px-4 py-2 shadow-sm">
              <div className="text-2xl font-bold text-primary">{currentTrajectory.steps}</div>
              <div className="text-xs text-gray-500 mt-1">总步数</div>
            </div>
            <div className="text-center bg-white rounded-lg px-4 py-2 shadow-sm">
              <div className="text-2xl font-bold text-purple-600">
                {currentTrajectory.messages.filter(m => m.thought).length}
              </div>
              <div className="text-xs text-gray-500 mt-1">思考次数</div>
            </div>
            {/* 逆合成轨迹特有统计 */}
            {isRetrosynthesis && (
              <>
                <div className="text-center bg-white rounded-lg px-4 py-2 shadow-sm">
                  <div className="text-2xl font-bold text-green-600">
                    {metadata.valid_steps || 0}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">有效步数</div>
                </div>
                <div className="text-center bg-white rounded-lg px-4 py-2 shadow-sm">
                  <div className="text-2xl font-bold text-orange-600">
                    {(metadata.total_reward || 0).toFixed(1)}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">总奖励</div>
                </div>
                {currentTrajectory.status === 'success' && (
                  <div className="text-center bg-white rounded-lg px-4 py-2 shadow-sm">
                    <div className="text-2xl font-bold text-blue-600">
                      {metadata.pathway_length}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">路径长度</div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* 对话区域 */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto space-y-4">
          {currentTrajectory.messages.map((message, index) => (
            <MessageBubble
              key={index}
              message={message}
              index={index}
              isRetrosynthesis={isRetrosynthesis}
            />
          ))}
        </div>
      </div>

      {/* 成功轨迹的逆合成路径树 */}
      {isRetrosynthesis && currentTrajectory.status === 'success' && metadata.final_pathway && (
        <RetrosynthesisTree
          targetMolecule={metadata.target_molecule}
          finalPathway={metadata.final_pathway}
        />
      )}
    </div>
  )
}
