import { useState } from 'react'

const COLLAPSE_THRESHOLD = 300

function CollapsibleText({ text, className = '' }) {
  const [expanded, setExpanded] = useState(false)
  if (!text) return null
  const needsCollapse = text.length > COLLAPSE_THRESHOLD

  return (
    <div className={className}>
      <div className={`whitespace-pre-wrap break-words ${!expanded && needsCollapse ? 'line-clamp-6' : ''}`}>
        {text}
      </div>
      {needsCollapse && (
        <button
          onClick={() => setExpanded(e => !e)}
          className="text-xs mt-1 opacity-70 hover:opacity-100 underline underline-offset-2"
        >
          {expanded ? '收起' : '展开全部'}
        </button>
      )}
    </div>
  )
}

function tryFormatJSON(str) {
  if (!str) return null
  try {
    const obj = JSON.parse(str)
    return obj
  } catch {
    return null
  }
}

function JsonBlock({ data, label }) {
  const [expanded, setExpanded] = useState(false)
  const jsonStr = JSON.stringify(data, null, 2)
  const isLong = jsonStr.length > 200

  return (
    <div className="font-mono text-xs bg-white/10 rounded overflow-hidden">
      {label && <div className="px-3 pt-2 text-xs opacity-60">{label}</div>}
      <pre className={`px-3 py-2 overflow-x-auto ${!expanded && isLong ? 'max-h-24 overflow-hidden' : ''}`}>
        {jsonStr}
      </pre>
      {isLong && (
        <button
          onClick={() => setExpanded(e => !e)}
          className="w-full text-xs text-center py-1 opacity-60 hover:opacity-100 border-t border-white/10"
        >
          {expanded ? '收起' : '展开 JSON'}
        </button>
      )}
    </div>
  )
}

function StructuredAction({ action, toolName, toolArgs }) {
  const parsed = tryFormatJSON(action)

  if (parsed) {
    return (
      <div className="space-y-2">
        {parsed.action && (
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-0.5 rounded bg-white/20 font-semibold">{parsed.action}</span>
          </div>
        )}
        {parsed.parameters && (
          <JsonBlock data={parsed.parameters} label="参数" />
        )}
        {!parsed.parameters && <JsonBlock data={parsed} />}
      </div>
    )
  }

  // 非 JSON action，原样显示
  return (
    <CollapsibleText text={action} className="font-mono text-sm bg-white/10 px-3 py-2 rounded" />
  )
}

function StructuredToolResponse({ content, toolName }) {
  const [expanded, setExpanded] = useState(false)
  const isLong = content.length > COLLAPSE_THRESHOLD

  // 尝试检测内容类型
  const isError = content.includes('Unknown tool') || content.includes('Invalid') || content.includes('cannot be used') || content.includes('Error')
  const isReaction = content.includes('Reactions for molecule') || content.includes('reaction')
  const isSelected = content.includes('Selected reaction') || content.includes('successfully')
  const parsed = tryFormatJSON(content)

  let statusIcon = '📋'
  let statusLabel = '响应'
  let bgCls = 'bg-gradient-to-br from-amber-50 to-orange-50 border border-orange-200'

  if (isError) {
    statusIcon = '❌'
    statusLabel = '错误'
    bgCls = 'bg-gradient-to-br from-red-50 to-rose-50 border border-red-200'
  } else if (isSelected) {
    statusIcon = '✅'
    statusLabel = '成功'
    bgCls = 'bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200'
  } else if (isReaction) {
    statusIcon = '🧪'
    statusLabel = '反应数据'
  }

  return (
    <div className={`rounded-2xl rounded-tl-sm px-5 py-4 shadow-sm ${bgCls}`}>
      <div className="flex items-center gap-2 mb-2">
        <span>{statusIcon}</span>
        <span className="text-xs font-semibold text-gray-600">{statusLabel}</span>
        {toolName && (
          <span className="text-xs text-gray-400 font-mono">({toolName})</span>
        )}
      </div>

      {parsed ? (
        <JsonBlock data={parsed} />
      ) : (
        <div className="text-sm text-gray-700 leading-relaxed">
          <div className={`whitespace-pre-wrap break-words font-mono text-xs bg-white/60 p-3 rounded ${!expanded && isLong ? 'max-h-32 overflow-hidden relative' : ''}`}>
            {content}
            {!expanded && isLong && (
              <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white/90 to-transparent" />
            )}
          </div>
          {isLong && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="text-xs text-gray-500 hover:text-gray-700 mt-1 underline underline-offset-2"
            >
              {expanded ? '收起' : `展开全部 (${content.length} 字符)`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default function MessageBubble({ message, index, isRetrosynthesis = false }) {
  const isHuman = message.role === 'human'
  const isAgent = message.role === 'agent'
  const metadata = message.metadata || {}

  // Agent 消息（右侧）
  if (isAgent) {
    const isValidAction = metadata.is_valid_action
    const reward = metadata.reward
    const cumulativeReward = metadata.cumulative_reward
    const toolName = metadata.tool_name
    const actionType = metadata.action_type
    const toolArgs = metadata.tool_args

    const bubbleBg = isRetrosynthesis
      ? isValidAction
        ? 'bg-gradient-to-br from-green-500 to-green-600 text-white'
        : 'bg-gradient-to-br from-blue-500 to-blue-600 text-white'
      : 'bg-gradient-to-br from-blue-500 to-blue-600 text-white'

    return (
      <div className="flex justify-end">
        <div className="max-w-3xl w-full">
          {/* 顶部元信息行 */}
          <div className="flex items-center justify-end gap-2 mb-2 flex-wrap">
            <span className="text-xs text-gray-400">
              Step #{metadata.step !== undefined ? metadata.step : Math.floor(index / 2) + 1}
            </span>
            {isRetrosynthesis && actionType && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-mono">
                {actionType}
              </span>
            )}
            {isRetrosynthesis && toolName && (
              <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                isValidAction ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
              }`}>
                {toolName}
              </span>
            )}
            <span className="text-sm font-medium text-primary">🤖 Agent</span>
          </div>

          <div className={`rounded-2xl rounded-tr-sm px-5 py-4 shadow-md ${bubbleBg}`}>
            {/* 思考区域 */}
            {message.thought && (
              <div className="mb-3 pb-3 border-b border-white/20">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-semibold opacity-80">💭 思考过程</span>
                </div>
                <CollapsibleText
                  text={message.thought}
                  className="text-sm italic leading-relaxed"
                />
              </div>
            )}

            {/* 动作区域 */}
            {message.action && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-semibold opacity-80">⚡ 执行动作</span>
                </div>
                <StructuredAction
                  action={message.action}
                  toolName={toolName}
                  toolArgs={toolArgs}
                />
              </div>
            )}

            {/* 无 thought 无 action 时显示 content */}
            {!message.thought && !message.action && (
              <CollapsibleText
                text={message.content}
                className="text-sm leading-relaxed"
              />
            )}

            {/* 奖励信息 */}
            {isRetrosynthesis && reward !== undefined && (
              <div className="mt-3 pt-3 border-t border-white/20 flex items-center gap-4 text-xs flex-wrap">
                <span className={reward >= 0 ? 'text-green-200' : 'text-red-200'}>
                  奖励: {reward > 0 ? '+' : ''}{typeof reward === 'number' ? reward.toFixed(2) : reward}
                </span>
                {cumulativeReward !== undefined && (
                  <span className="text-white/70">
                    累计: {typeof cumulativeReward === 'number' ? cumulativeReward.toFixed(2) : cumulativeReward}
                  </span>
                )}
                {isValidAction !== undefined && (
                  <span className={isValidAction ? 'text-green-200' : 'text-red-200'}>
                    {isValidAction ? '有效动作' : '无效动作'}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Human / Tool Response 消息（左侧）
  if (isHuman) {
    const isInitial = message.content.includes('Interact with a household')
    const hasTask = message.content.includes('Your task is to:')
    const hasAvailableActions = message.content.includes('AVAILABLE ACTIONS:')
    const isToolResponse = metadata.type === 'tool_response'
    const respondingToolName = metadata.tool_name

    // 逆合成工具响应 —— 用专用组件
    if (isRetrosynthesis && isToolResponse) {
      return (
        <div className="flex justify-start">
          <div className="max-w-3xl w-full">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-medium text-gray-600">🔬 工具响应</span>
              {metadata.step !== undefined && (
                <span className="text-xs text-gray-400">Step #{metadata.step}</span>
              )}
            </div>
            <StructuredToolResponse content={message.content} toolName={respondingToolName} />
          </div>
        </div>
      )
    }

    return (
      <div className="flex justify-start">
        <div className="max-w-3xl w-full">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-medium text-gray-600">
              {isRetrosynthesis ? '🔬 Tool Response' : '🌍 Environment'}
            </span>
            {isRetrosynthesis && respondingToolName && (
              <span className="text-xs text-gray-500">({respondingToolName})</span>
            )}
          </div>

          <div className={`rounded-2xl rounded-tl-sm px-5 py-4 shadow-sm ${
            isInitial
              ? 'bg-gradient-to-br from-gray-100 to-gray-200 border-2 border-gray-300'
              : 'bg-gray-100'
          }`}>
            {hasTask ? (
              <div className="space-y-3">
                {message.content.split('Your task is to:')[0] && (
                  <CollapsibleText
                    text={message.content.split('Your task is to:')[0].trim()}
                    className="text-sm text-gray-700 leading-relaxed"
                  />
                )}

                <div className="bg-yellow-50 border-l-4 border-yellow-400 p-3 rounded">
                  <div className="text-xs font-semibold text-yellow-800 mb-1">🎯 TASK</div>
                  <div className="text-sm font-medium text-yellow-900">
                    {message.content.split('Your task is to:')[1].split('\n')[0].trim()}
                  </div>
                </div>

                {hasAvailableActions && (
                  <div className="bg-blue-50 border-l-4 border-blue-400 p-3 rounded">
                    <div className="text-xs font-semibold text-blue-800 mb-1">🎮 AVAILABLE ACTIONS</div>
                    <CollapsibleText
                      text={message.content.split('AVAILABLE ACTIONS:')[1].trim()}
                      className="text-xs text-blue-900 font-mono"
                    />
                  </div>
                )}
              </div>
            ) : (
              <CollapsibleText
                text={message.content}
                className="text-sm text-gray-700 leading-relaxed"
              />
            )}
          </div>
        </div>
      </div>
    )
  }

  return null
}
