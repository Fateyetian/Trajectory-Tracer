export default function MessageBubble({ message, index }) {
  const isHuman = message.role === 'human'
  const isAgent = message.role === 'agent'

  // Agent 消息（右侧）
  if (isAgent) {
    return (
      <div className="flex justify-end">
        <div className="max-w-2xl">
          <div className="flex items-center justify-end gap-2 mb-2">
            <span className="text-xs text-gray-400">Step #{Math.floor(index / 2) + 1}</span>
            <span className="text-sm font-medium text-primary">🤖 Agent</span>
          </div>

          <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-2xl rounded-tr-sm px-5 py-4 shadow-md">
            {message.thought && (
              <div className="mb-3 pb-3 border-b border-blue-400/30">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-semibold text-blue-100">💭 THOUGHT</span>
                </div>
                <div className="text-sm italic leading-relaxed">
                  {message.thought}
                </div>
              </div>
            )}

            {message.action && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-semibold text-blue-100">⚡ ACTION</span>
                </div>
                <div className="font-mono text-sm font-medium bg-blue-700/30 px-3 py-2 rounded">
                  {message.action}
                </div>
              </div>
            )}

            {!message.thought && !message.action && (
              <div className="text-sm">
                {message.content}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Human 消息（左侧）
  if (isHuman) {
    // 检查是否是初始指令
    const isInitial = message.content.includes('Interact with a household')

    // 检查是否包含任务描述
    const hasTask = message.content.includes('Your task is to:')
    const hasAvailableActions = message.content.includes('AVAILABLE ACTIONS:')

    return (
      <div className="flex justify-start">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-medium text-gray-600">🌍 Environment</span>
          </div>

          <div className={`rounded-2xl rounded-tl-sm px-5 py-4 shadow-sm ${
            isInitial
              ? 'bg-gradient-to-br from-gray-100 to-gray-200 border-2 border-gray-300'
              : 'bg-gray-100'
          }`}>
            {hasTask ? (
              // 解析并格式化包含任务的消息
              <div className="space-y-3">
                {message.content.split('Your task is to:')[0] && (
                  <div className="text-sm text-gray-700 leading-relaxed">
                    {message.content.split('Your task is to:')[0].trim()}
                  </div>
                )}

                {hasTask && (
                  <div className="bg-yellow-50 border-l-4 border-yellow-400 p-3 rounded">
                    <div className="text-xs font-semibold text-yellow-800 mb-1">🎯 TASK</div>
                    <div className="text-sm font-medium text-yellow-900">
                      {message.content.split('Your task is to:')[1].split('\n')[0].trim()}
                    </div>
                  </div>
                )}

                {hasAvailableActions && (
                  <div className="bg-blue-50 border-l-4 border-blue-400 p-3 rounded">
                    <div className="text-xs font-semibold text-blue-800 mb-1">🎮 AVAILABLE ACTIONS</div>
                    <div className="text-xs text-blue-900 font-mono">
                      {message.content.split('AVAILABLE ACTIONS:')[1].trim()}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              // 普通观察消息
              <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                {message.content}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return null
}
