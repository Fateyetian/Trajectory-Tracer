import { useStore } from '../store'
import MessageBubble from './MessageBubble'

export default function TrajectoryViewer() {
  const { currentTrajectory } = useStore()

  if (!currentTrajectory) return null

  const getStatusIcon = (status) => {
    return status === 'success' ? '✅' : status === 'failed' ? '❌' : '❓'
  }

  return (
    <div className="flex-1 flex flex-col bg-white overflow-hidden">
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

            {currentTrajectory.environment && (
              <div className="text-sm text-gray-600 bg-white/50 rounded p-3 mt-3">
                <div className="font-medium mb-1">🌍 环境描述:</div>
                <div className="whitespace-pre-wrap">{currentTrajectory.environment}</div>
              </div>
            )}
          </div>

          <div className="flex gap-4 ml-4">
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
          </div>
        </div>
      </div>

      {/* 对话区域 */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto space-y-4">
          {currentTrajectory.messages.map((message, index) => (
            <MessageBubble key={index} message={message} index={index} />
          ))}
        </div>
      </div>
    </div>
  )
}
