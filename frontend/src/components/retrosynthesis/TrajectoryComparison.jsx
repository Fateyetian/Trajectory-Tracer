import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useStore } from '../../store'
import MoleculeRenderer from './MoleculeRenderer'

// ───────────────────────────────────────────────
// 缩放常量
// ───────────────────────────────────────────────

const ZOOM_MIN = 0.25
const ZOOM_MAX = 2.5
const ZOOM_STEP = 0.25

// ───────────────────────────────────────────────
// 工具函数
// ───────────────────────────────────────────────

function getStepBg(reward, isValid) {
  if (!isValid) return 'bg-orange-50 border-l-2 border-orange-300'
  if (reward > 1.0) return 'bg-green-100'
  if (reward > 0) return 'bg-green-50'
  if (reward < 0) return 'bg-red-50'
  return ''
}

function getRewardText(reward) {
  if (reward == null) return '—'
  if (reward > 0) return `+${reward.toFixed(2)}`
  return reward.toFixed(2)
}

function getRewardTextColor(reward) {
  if (reward > 0) return 'text-green-700 font-bold'
  if (reward < 0) return 'text-red-600 font-bold'
  return 'text-gray-400'
}

const ACTION_LABELS = {
  expand: '展开',
  select_reaction: '选择反应',
  backtrack: '回溯',
  finish: '完成',
  unknown: '未知',
}

function getActionLabel(actionType) {
  return ACTION_LABELS[actionType] || actionType
}

// ───────────────────────────────────────────────
// 子组件：单步卡片
// ───────────────────────────────────────────────

function StepCard({ step }) {
  const bg = getStepBg(step.reward, step.is_valid_action)
  const rewardCls = getRewardTextColor(step.reward)

  return (
    <div className={`px-2 py-1.5 border-b border-gray-100 ${bg}`}>
      {/* 第一行：步骤号、动作类型、奖励 */}
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-gray-400 w-5 text-right flex-shrink-0">
          {step.step}
        </span>
        <span className="text-[11px] text-gray-600 flex-shrink-0 truncate max-w-[72px]">
          {getActionLabel(step.action_type)}
        </span>
        <span className={`ml-auto text-[11px] flex-shrink-0 ${rewardCls}`}>
          {getRewardText(step.reward)}
        </span>
      </div>
      {/* 第二行：工具名、累计奖励 */}
      <div className="flex items-center gap-1 pl-6 mt-0.5">
        <span className="text-[9px] text-gray-400 truncate">
          {step.tool_name || '—'}
        </span>
        <span className="text-[9px] text-gray-300 ml-auto flex-shrink-0">
          ∑{step.cumulative_reward != null ? step.cumulative_reward.toFixed(2) : '—'}
        </span>
      </div>
    </div>
  )
}

// ───────────────────────────────────────────────
// 子组件：单条轨迹列
// ───────────────────────────────────────────────

function TrajectoryColumn({ traj, onViewDetail }) {
  const ok = traj.status === 'success'
  const headerCls = ok
    ? 'bg-gradient-to-b from-green-100 to-green-50 border-green-300'
    : 'bg-gradient-to-b from-red-100 to-red-50 border-red-300'
  const footerCls = ok
    ? 'bg-green-50 border-green-200 text-green-700'
    : 'bg-red-50 border-red-200 text-red-700'

  return (
    <div className="flex flex-col border border-gray-200 rounded-xl overflow-hidden shadow-sm w-52 flex-shrink-0 bg-white">
      {/* 顶部：轨迹摘要 */}
      <div className={`px-3 py-2.5 border-b ${headerCls}`}>
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="text-sm">{ok ? '✅' : '❌'}</span>
          <span className={`text-xs font-bold ${ok ? 'text-green-800' : 'text-red-800'}`}>
            {ok ? '成功' : '失败'}
          </span>
        </div>

        <div className="space-y-0.5 text-[11px]">
          <div className="flex justify-between items-center">
            <span className="text-gray-500">总奖励</span>
            <span className="font-bold text-gray-800 text-sm">
              {traj.total_reward != null ? traj.total_reward.toFixed(2) : '—'}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-500">总步数</span>
            <span className="text-gray-700">{traj.total_steps}</span>
          </div>
          {ok && (
            <div className="flex justify-between items-center">
              <span className="text-gray-500">路径长度</span>
              <span className="text-blue-600 font-medium">{traj.pathway_length}</span>
            </div>
          )}
        </div>

        <button
          onClick={() => onViewDetail(traj.id)}
          className="mt-2 w-full text-[10px] text-gray-500 hover:text-indigo-600 bg-white/70 hover:bg-white border border-gray-200 rounded px-2 py-1 transition-colors"
        >
          查看完整轨迹 →
        </button>
      </div>

      {/* 步骤列头 */}
      <div className="flex justify-between px-2 py-1 bg-gray-50 border-b border-gray-100 text-[9px] text-gray-400 uppercase tracking-wide">
        <span>步 · 动作</span>
        <span>奖励 · 累计</span>
      </div>

      {/* 步骤列表（可独立纵向滚动） */}
      <div className="overflow-y-auto flex-1" style={{ maxHeight: 440 }}>
        {traj.steps.length === 0 ? (
          <div className="py-4 text-center text-xs text-gray-400">无步骤数据</div>
        ) : (
          traj.steps.map(step => (
            <StepCard key={step.step} step={step} />
          ))
        )}
      </div>

      {/* 底部：总奖励汇总 */}
      <div className={`px-3 py-2 border-t ${footerCls} text-xs`}>
        <div className="flex items-center justify-between">
          <span className="font-medium">总奖励</span>
          <span className="text-lg font-bold">{traj.total_reward != null ? traj.total_reward.toFixed(2) : '—'}</span>
        </div>
        {ok && traj.final_pathway && traj.final_pathway.length > 0 && (
          <div className="mt-1 text-[10px] text-green-600 opacity-80">
            反应路径：{traj.final_pathway.length} 步
          </div>
        )}
      </div>
    </div>
  )
}

// ───────────────────────────────────────────────
// 主组件：轨迹对比视图
// ───────────────────────────────────────────────

export default function TrajectoryComparison() {
  const {
    comparisonData,
    comparisonLoading,
    closeComparison,
    fetchTrajectoryDetail,
  } = useStore()

  const [filter, setFilter] = useState('all')
  const [zoom, setZoom] = useState(1)

  const scrollContainerRef = useRef(null)
  const innerRef = useRef(null)
  const rootRef = useRef(null)
  const columnRefs = useRef([])
  const [lines, setLines] = useState([])
  const [innerSize, setInnerSize] = useState({ width: 0, height: 0 })

  const filteredTrajectories = useMemo(() => {
    if (!comparisonData) return []
    const all = comparisonData.trajectories
    if (filter === 'success') return all.filter(t => t.status === 'success')
    if (filter === 'failed') return all.filter(t => t.status !== 'success')
    return all
  }, [comparisonData, filter])

  // 重置 columnRefs 长度以匹配当前轨迹数
  useEffect(() => {
    columnRefs.current = columnRefs.current.slice(0, filteredTrajectories.length)
  }, [filteredTrajectories.length])

  // 切换数据时重置缩放
  useEffect(() => {
    setZoom(1)
  }, [comparisonData])

  // 计算 SVG 连线（坐标除以 zoom 还原到 SVG 坐标空间）
  const computeLines = useCallback(() => {
    if (!innerRef.current || !rootRef.current) return

    const innerRect = innerRef.current.getBoundingClientRect()
    const rootRect = rootRef.current.getBoundingClientRect()

    const rootX = (rootRect.left + rootRect.width / 2 - innerRect.left) / zoom
    const rootY = (rootRect.bottom - innerRect.top) / zoom

    const newLines = []
    columnRefs.current.forEach((colEl, i) => {
      if (!colEl) return
      const colRect = colEl.getBoundingClientRect()
      const colX = (colRect.left + colRect.width / 2 - innerRect.left) / zoom
      const colY = (colRect.top - innerRect.top) / zoom
      const midY = (rootY + colY) / 2

      newLines.push({
        key: `root-col-${i}`,
        d: `M ${rootX} ${rootY} L ${rootX} ${midY} L ${colX} ${midY} L ${colX} ${colY}`,
        isSuccess: filteredTrajectories[i]?.status === 'success',
      })
    })

    setLines(newLines)
    setInnerSize({
      width: innerRef.current.scrollWidth,
      height: innerRef.current.scrollHeight,
    })
  }, [filteredTrajectories, zoom])

  useEffect(() => {
    const timer = setTimeout(computeLines, 400)
    return () => clearTimeout(timer)
  }, [computeLines])

  // 缩放变化后重算连线
  useEffect(() => {
    const timer = setTimeout(computeLines, 50)
    return () => clearTimeout(timer)
  }, [zoom, computeLines])

  // ESC 关闭
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') closeComparison() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closeComparison])

  // Ctrl+滚轮 缩放
  const handleWheel = useCallback((e) => {
    if (!e.ctrlKey && !e.metaKey) return
    e.preventDefault()
    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP
    setZoom(z => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, parseFloat((z + delta).toFixed(2)))))
  }, [])

  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  const handleViewDetail = useCallback(async (id) => {
    closeComparison()
    await fetchTrajectoryDetail(id)
  }, [closeComparison, fetchTrajectoryDetail])

  const handleZoomIn = () => setZoom(z => Math.min(ZOOM_MAX, parseFloat((z + ZOOM_STEP).toFixed(2))))
  const handleZoomOut = () => setZoom(z => Math.max(ZOOM_MIN, parseFloat((z - ZOOM_STEP).toFixed(2))))
  const handleZoomReset = () => setZoom(1)

  if (!comparisonData && !comparisonLoading) return null

  const totalCount = comparisonData?.trajectories.length ?? 0
  const successCount = comparisonData?.trajectories.filter(t => t.status === 'success').length ?? 0

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* ── 顶部标题栏 ── */}
      <div className="flex-shrink-0 bg-gradient-to-r from-purple-600 to-indigo-700 text-white px-6 py-3 flex items-center gap-4 shadow-md">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xl">🔀</span>
            <h2 className="text-base font-bold">多轨迹对比</h2>
            {comparisonData && (
              <span className="text-sm text-purple-200 ml-2">
                共 {totalCount} 条 ·{' '}
                <span className="text-green-300">{successCount} 成功</span>{' '}·{' '}
                <span className="text-red-300">{totalCount - successCount} 失败</span>
              </span>
            )}
          </div>
        </div>

        {/* 缩放控件 */}
        <div className="flex items-center gap-1 bg-white/15 border border-white/30 rounded px-1 py-0.5 flex-shrink-0">
          <button
            onClick={handleZoomOut}
            disabled={zoom <= ZOOM_MIN}
            className="w-6 h-6 flex items-center justify-center text-white hover:bg-white/20 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-base leading-none"
            title="缩小"
          >
            −
          </button>
          <button
            onClick={handleZoomReset}
            className="px-1.5 text-xs font-mono text-white hover:bg-white/20 rounded transition-colors min-w-[3rem] text-center"
            title="重置缩放"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            onClick={handleZoomIn}
            disabled={zoom >= ZOOM_MAX}
            className="w-6 h-6 flex items-center justify-center text-white hover:bg-white/20 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-base leading-none"
            title="放大"
          >
            +
          </button>
        </div>

        {/* 过滤器 */}
        <div className="flex gap-1.5 flex-shrink-0">
          {[
            ['all', '全部'],
            ['success', '✅ 成功'],
            ['failed', '❌ 失败'],
          ].map(([val, label]) => (
            <button
              key={val}
              onClick={() => setFilter(val)}
              className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                filter === val
                  ? 'bg-white text-purple-700'
                  : 'bg-white/20 text-white hover:bg-white/30'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <button
          onClick={closeComparison}
          className="flex-shrink-0 text-white/70 hover:text-white bg-white/10 hover:bg-white/25 rounded-full w-8 h-8 flex items-center justify-center text-lg transition-colors"
          title="关闭 (ESC)"
        >
          ✕
        </button>
      </div>

      {/* ── 加载中 ── */}
      {comparisonLoading && (
        <div className="flex-1 flex items-center justify-center bg-gray-50">
          <div className="text-gray-400 text-center">
            <div className="text-5xl mb-4 animate-spin">⚗️</div>
            <p className="text-sm">正在加载对比数据...</p>
          </div>
        </div>
      )}

      {/* ── 主体内容 ── */}
      {!comparisonLoading && comparisonData && (
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-auto bg-gradient-to-br from-gray-50 to-indigo-50"
        >
          {/* Spacer：撑开缩放后的真实尺寸，保证滚动条正确出现 */}
          <div style={{
            width: innerSize.width * zoom,
            height: innerSize.height * zoom,
            minWidth: innerSize.width * zoom,
            position: 'relative',
          }}>
            {/* 内层容器：应用 transform 缩放，坐标系以 top-left 为原点 */}
            <div
              ref={innerRef}
              className="relative p-8"
              style={{
                minWidth: 'max-content',
                transform: `scale(${zoom})`,
                transformOrigin: 'top left',
                position: 'absolute',
                top: 0,
                left: 0,
              }}
            >
              {/* SVG 连线层（使用未缩放的 scrollWidth/Height） */}
              <svg
                className="absolute top-0 left-0 pointer-events-none"
                style={{
                  zIndex: 1,
                  width: innerSize.width || '100%',
                  height: innerSize.height || '100%',
                }}
              >
                {lines.map(line => (
                  <path
                    key={line.key}
                    d={line.d}
                    fill="none"
                    stroke={line.isSuccess ? '#86efac' : '#fca5a5'}
                    strokeWidth="2"
                    strokeDasharray="6,3"
                  />
                ))}
              </svg>

              {/* ── 根节点：目标分子 ── */}
              <div
                className="flex justify-center mb-12"
                style={{ position: 'relative', zIndex: 2 }}
              >
                <div
                  ref={rootRef}
                  className="bg-white border-2 border-purple-400 rounded-2xl shadow-xl p-4 max-w-[280px]"
                >
                  <div className="text-center text-xs font-bold text-purple-700 mb-2 tracking-wide">
                    🎯 目标分子（根节点）
                  </div>
                  <MoleculeRenderer
                    smiles={comparisonData.target_molecule}
                    width={240}
                    height={170}
                    isRoot={true}
                  />
                  <div className="mt-2 text-[10px] font-mono text-gray-400 break-all text-center leading-tight max-w-[240px] line-clamp-2">
                    {comparisonData.target_molecule}
                  </div>
                  <div className="mt-3 flex gap-4 justify-center text-xs">
                    <span className="text-green-600 font-semibold">✅ 成功 {successCount}</span>
                    <span className="text-gray-300">|</span>
                    <span className="text-red-500 font-semibold">❌ 失败 {totalCount - successCount}</span>
                  </div>
                </div>
              </div>

              {/* ── 轨迹列区域 ── */}
              <div
                className="flex gap-5 items-start"
                style={{ position: 'relative', zIndex: 2 }}
              >
                {filteredTrajectories.length === 0 ? (
                  <div className="text-gray-400 text-sm py-12 px-6">
                    暂无符合筛选条件的轨迹
                  </div>
                ) : (
                  filteredTrajectories.map((traj, i) => (
                    <div
                      key={traj.id}
                      ref={el => { columnRefs.current[i] = el }}
                    >
                      <TrajectoryColumn
                        traj={traj}
                        onViewDetail={handleViewDetail}
                      />
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 底部提示 ── */}
      {!comparisonLoading && (
        <div className="flex-shrink-0 bg-white border-t border-gray-100 px-6 py-2 text-[11px] text-gray-400 flex items-center gap-4">
          <span>按 ESC 关闭 · Ctrl+滚轮 缩放 · 点击「查看完整轨迹」可跳转到单条轨迹详情</span>
          <div className="ml-auto flex gap-3">
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-1 bg-green-300 rounded" style={{ borderTop: '1px dashed #86efac' }} />
              成功路径
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-1 bg-red-300 rounded" style={{ borderTop: '1px dashed #fca5a5' }} />
              失败路径
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 bg-green-100 border border-green-200 rounded-sm" />
              正奖励
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 bg-red-100 border border-red-200 rounded-sm" />
              负奖励
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 bg-orange-100 border-l-2 border-orange-300 rounded-sm" />
              无效动作
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
