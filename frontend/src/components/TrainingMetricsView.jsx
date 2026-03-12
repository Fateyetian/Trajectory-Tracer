import { useState } from 'react'
import { useStore } from '../store'

// ── 实验元数据 ────────────────────────────────────────────────────────────
const EXP_CONFIG = {
  v6: {
    label: 'v6 (Retro-GiGPO)',
    color: '#94a3b8',
    desc: 'Baseline: GiGPO + process reward, retro-specific advantage',
    date: '2026-03-03',
  },
  v7: {
    label: 'v7 (+ KL-cov loss)',
    color: '#f59e0b',
    desc: 'Added KL-cov loss mode to prevent rapid collapse',
    date: '2026-03-04',
  },
  v8: {
    label: 'v8 (+ 500mol SFT)',
    color: '#3b82f6',
    desc: 'Better SFT init (500mol), KL-cov, extended 200ep training',
    date: '2026-03-04',
  },
  v9: {
    label: 'v9 (Reward v9)',
    color: '#10b981',
    desc: 'New reward: step_penalty_clip + MLP 3-layer validation + anchor_obs fix',
    date: '2026-03-09',
  },
}

// ── 多线图表组件 ──────────────────────────────────────────────────────────
function SVGMultiLineChart({ datasets, yKey, height = 180, yLabel, showPhaseAnnotations = false }) {
  if (!datasets || datasets.length === 0) return null

  const width = 560
  const padLeft = 48
  const padRight = 16
  const padTop = 16
  const padBottom = 30
  const chartW = width - padLeft - padRight
  const chartH = height - padTop - padBottom

  // 全局范围
  const allValues = datasets.flatMap(d => d.data.map(p => p[yKey]).filter(v => v != null && !isNaN(v)))
  if (allValues.length === 0) return null
  const minY = Math.min(...allValues)
  const maxY = Math.max(...allValues)
  const rangeY = maxY - minY || 1

  // x轴：所有数据集的最大步数
  const maxStep = Math.max(...datasets.flatMap(d => d.data.map(p => p.step)))
  const minStep = Math.min(...datasets.flatMap(d => d.data.map(p => p.step)))
  const rangeX = maxStep - minStep || 1

  const toX = (step) => padLeft + ((step - minStep) / rangeX) * chartW
  const toY = (v) => padTop + chartH - ((v - minY) / rangeY) * chartH

  // Y轴刻度（5个）
  const yTicks = Array.from({ length: 5 }, (_, i) => minY + (rangeY * i) / 4)
  // X轴刻度（6个）
  const xTickSteps = Array.from({ length: 6 }, (_, i) => Math.round(minStep + (rangeX * i) / 5))

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }}>
      {/* 背景 */}
      <rect x={padLeft} y={padTop} width={chartW} height={chartH} fill="#fafafa" rx="2" />

      {/* Phase 注释（v9 三阶段）*/}
      {showPhaseAnnotations && (
        <>
          <rect x={toX(1)} y={padTop} width={toX(27) - toX(1)} height={chartH} fill="#d1fae5" opacity="0.4" />
          <rect x={toX(27)} y={padTop} width={toX(40) - toX(27)} height={chartH} fill="#fef3c7" opacity="0.4" />
          <rect x={toX(40)} y={padTop} width={toX(58) - toX(40)} height={chartH} fill="#fee2e2" opacity="0.4" />
          <text x={(toX(1) + toX(27)) / 2} y={padTop + 10} textAnchor="middle" fontSize="9" fill="#059669" fontWeight="600">Rise</text>
          <text x={(toX(27) + toX(40)) / 2} y={padTop + 10} textAnchor="middle" fontSize="9" fill="#d97706" fontWeight="600">Decay</text>
          <text x={(toX(40) + toX(58)) / 2} y={padTop + 10} textAnchor="middle" fontSize="9" fill="#dc2626" fontWeight="600">Collapse</text>
        </>
      )}

      {/* 网格线 */}
      {yTicks.map((tick, i) => (
        <g key={i}>
          <line x1={padLeft} y1={toY(tick)} x2={padLeft + chartW} y2={toY(tick)}
            stroke="#e5e7eb" strokeWidth="1" strokeDasharray={i === 0 ? "none" : "3,3"} />
          <text x={padLeft - 5} y={toY(tick) + 4} textAnchor="end" fontSize="9" fill="#6b7280">
            {tick.toFixed(tick > 10 ? 1 : 2)}
          </text>
        </g>
      ))}

      {/* X轴线 */}
      <line x1={padLeft} y1={padTop + chartH} x2={padLeft + chartW} y2={padTop + chartH} stroke="#d1d5db" strokeWidth="1" />

      {/* X轴刻度 */}
      {xTickSteps.map((step, i) => (
        <text key={i} x={toX(step)} y={padTop + chartH + 16} textAnchor="middle" fontSize="9" fill="#6b7280">
          {step}
        </text>
      ))}

      {/* Y轴标签 */}
      {yLabel && (
        <text x={10} y={padTop + chartH / 2} textAnchor="middle" fontSize="9" fill="#6b7280"
          transform={`rotate(-90, 10, ${padTop + chartH / 2})`}>{yLabel}</text>
      )}

      {/* X轴标签 */}
      <text x={padLeft + chartW / 2} y={height - 4} textAnchor="middle" fontSize="9" fill="#6b7280">Training Step</text>

      {/* 数据线 */}
      {datasets.map((dataset, di) => {
        const validPts = dataset.data.filter(d => d[yKey] != null && !isNaN(d[yKey]))
        if (validPts.length === 0) return null
        const pathD = validPts.map((d, i) =>
          `${i === 0 ? 'M' : 'L'}${toX(d.step)},${toY(d[yKey])}`
        ).join(' ')
        return (
          <g key={di}>
            <path d={pathD} fill="none" stroke={dataset.color} strokeWidth="2"
              strokeLinejoin="round" strokeLinecap="round" opacity="0.9" />
          </g>
        )
      })}

      {/* 边框 */}
      <rect x={padLeft} y={padTop} width={chartW} height={chartH} fill="none" stroke="#d1d5db" strokeWidth="1" rx="2" />
    </svg>
  )
}

// ── 单线图 ────────────────────────────────────────────────────────────────
function SVGLineChart({ data, yKey, color = '#3b82f6', height = 130, yLabel, showDots = false }) {
  if (!data || data.length === 0) return null
  const vals = data.map(d => d[yKey]).filter(v => v != null && !isNaN(v))
  if (vals.length === 0) return null

  const width = 400
  const padLeft = 44
  const padRight = 12
  const padTop = 12
  const padBottom = 26
  const chartW = width - padLeft - padRight
  const chartH = height - padTop - padBottom

  const minY = Math.min(...vals)
  const maxY = Math.max(...vals)
  const rangeY = maxY - minY || 1

  const xVals = data.map(d => d.step)
  const minX = Math.min(...xVals)
  const maxX = Math.max(...xVals)
  const rangeX = maxX - minX || 1

  const toX = (s) => padLeft + ((s - minX) / rangeX) * chartW
  const toY = (v) => padTop + chartH - ((v - minY) / rangeY) * chartH

  const yTicks = Array.from({ length: 4 }, (_, i) => minY + (rangeY * i) / 3)
  const xTicks = Array.from({ length: 5 }, (_, i) => Math.round(minX + (rangeX * i) / 4))

  const validData = data.filter(d => d[yKey] != null && !isNaN(d[yKey]))
  const pathD = validData.map((d, i) => `${i === 0 ? 'M' : 'L'}${toX(d.step)},${toY(d[yKey])}`).join(' ')

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }}>
      <rect x={padLeft} y={padTop} width={chartW} height={chartH} fill="#fafafa" rx="2" />
      {yTicks.map((tick, i) => (
        <g key={i}>
          <line x1={padLeft} y1={toY(tick)} x2={padLeft + chartW} y2={toY(tick)}
            stroke="#e5e7eb" strokeWidth="1" strokeDasharray="3,3" />
          <text x={padLeft - 4} y={toY(tick) + 4} textAnchor="end" fontSize="9" fill="#6b7280">
            {tick.toFixed(tick > 10 ? 1 : 2)}
          </text>
        </g>
      ))}
      {xTicks.map((s, i) => (
        <text key={i} x={toX(s)} y={padTop + chartH + 16} textAnchor="middle" fontSize="9" fill="#6b7280">{s}</text>
      ))}
      <line x1={padLeft} y1={padTop + chartH} x2={padLeft + chartW} y2={padTop + chartH} stroke="#d1d5db" strokeWidth="1" />
      {yLabel && (
        <text x={10} y={padTop + chartH / 2} textAnchor="middle" fontSize="9" fill="#6b7280"
          transform={`rotate(-90, 10, ${padTop + chartH / 2})`}>{yLabel}</text>
      )}
      <text x={padLeft + chartW / 2} y={height - 4} textAnchor="middle" fontSize="9" fill="#6b7280">Step</text>
      <path d={pathD} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {showDots && validData.map((d, i) => (
        <circle key={i} cx={toX(d.step)} cy={toY(d[yKey])} r="2.5" fill={color}>
          <title>{`Step ${d.step}: ${d[yKey]?.toFixed(4)}`}</title>
        </circle>
      ))}
      <rect x={padLeft} y={padTop} width={chartW} height={chartH} fill="none" stroke="#d1d5db" strokeWidth="1" rx="2" />
    </svg>
  )
}

// ── 图例 ─────────────────────────────────────────────────────────────────
function Legend({ items }) {
  return (
    <div className="flex flex-wrap gap-4 mt-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <div className="w-5 h-0.5 rounded" style={{ backgroundColor: item.color, height: '2px' }} />
          <span className="text-xs text-gray-600">{item.label}</span>
        </div>
      ))}
    </div>
  )
}

// ── 指标卡片 ──────────────────────────────────────────────────────────────
function StatBadge({ label, value, color = 'gray' }) {
  const colorMap = {
    green: 'text-green-700 bg-green-50 border-green-200',
    red: 'text-red-700 bg-red-50 border-red-200',
    blue: 'text-blue-700 bg-blue-50 border-blue-200',
    orange: 'text-orange-700 bg-orange-50 border-orange-200',
    gray: 'text-gray-700 bg-gray-50 border-gray-200',
  }
  return (
    <div className={`inline-flex flex-col px-3 py-2 rounded-lg border ${colorMap[color]} min-w-[90px]`}>
      <span className="text-xs opacity-60 font-medium">{label}</span>
      <span className="text-sm font-bold font-mono">{value}</span>
    </div>
  )
}

// ── 单实验面板 ────────────────────────────────────────────────────────────
function ExperimentPanel({ expName, expData }) {
  const cfg = EXP_CONFIG[expName]
  if (!expData || !expData.steps || expData.steps.length === 0) return null

  const steps = expData.steps
  const peak = steps.reduce((a, b) => (b.success_rate ?? 0) > (a.success_rate ?? 0) ? b : a, steps[0])
  const last = steps[steps.length - 1]
  const first = steps[0]

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between"
        style={{ borderLeft: `4px solid ${cfg.color}` }}>
        <div>
          <span className="font-semibold text-gray-800 text-sm">{cfg.label}</span>
          <span className="ml-2 text-xs text-gray-400">{cfg.date}</span>
        </div>
        <span className="text-xs text-gray-500 max-w-xs text-right">{cfg.desc}</span>
      </div>
      <div className="p-4 space-y-4">
        <div className="flex flex-wrap gap-2">
          <StatBadge label="Total Steps" value={expData.total_steps} color="gray" />
          <StatBadge label="Peak Success" value={`${(peak.success_rate * 100).toFixed(1)}%`} color="green" />
          <StatBadge label="Peak @ Step" value={peak.step} color="blue" />
          <StatBadge label="Final Success" value={`${(last.success_rate * 100).toFixed(1)}%`}
            color={last.success_rate > 0.1 ? 'green' : 'red'} />
          <StatBadge label="Final Reward" value={last.reward_mean?.toFixed(2)}
            color={last.reward_mean > 0 ? 'green' : 'red'} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs font-medium text-gray-500 mb-1">Success Rate</div>
            <SVGLineChart data={steps} yKey="success_rate" color={cfg.color} height={110} showDots={steps.length <= 30} />
          </div>
          <div>
            <div className="text-xs font-medium text-gray-500 mb-1">Reward Mean</div>
            <SVGLineChart data={steps} yKey="reward_mean" color={cfg.color} height={110} showDots={steps.length <= 30} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── 研究分析报告 ──────────────────────────────────────────────────────────
function ResearchAnalysis({ allData }) {
  if (!allData) return null

  const v9 = allData.v9
  const v8 = allData.v8
  const v7 = allData.v7
  const v6 = allData.v6

  const getPeak = (exp) => {
    if (!exp?.steps?.length) return { step: '-', rate: 0 }
    const p = exp.steps.reduce((a, b) => (b.success_rate ?? 0) > (a.success_rate ?? 0) ? b : a, exp.steps[0])
    return { step: p.step, rate: p.success_rate ?? 0 }
  }

  const peaks = { v6: getPeak(v6), v7: getPeak(v7), v8: getPeak(v8), v9: getPeak(v9) }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
        <h3 className="font-bold text-gray-900 text-base">实验分析报告</h3>
        <p className="text-xs text-gray-500 mt-0.5">Retro-GiGPO 训练动态分析 — v6 至 v9</p>
      </div>
      <div className="p-5 space-y-5">

        {/* 实验对比表 */}
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Table 1. 实验配置与关键结果</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border border-gray-200 px-3 py-2 text-left font-semibold text-gray-600">Experiment</th>
                  <th className="border border-gray-200 px-3 py-2 text-center font-semibold text-gray-600">Key Innovation</th>
                  <th className="border border-gray-200 px-3 py-2 text-center font-semibold text-gray-600">Total Steps</th>
                  <th className="border border-gray-200 px-3 py-2 text-center font-semibold text-gray-600">Peak Success</th>
                  <th className="border border-gray-200 px-3 py-2 text-center font-semibold text-gray-600">Peak @ Step</th>
                  <th className="border border-gray-200 px-3 py-2 text-center font-semibold text-gray-600">Final Success</th>
                  <th className="border border-gray-200 px-3 py-2 text-center font-semibold text-gray-600">Stability</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['v6', 'Baseline Retro-GiGPO', v6],
                  ['v7', '+KL-cov loss', v7],
                  ['v8', '+500mol SFT init', v8],
                  ['v9', '+Reward v9 (step_clip)', v9],
                ].map(([name, innovation, exp]) => {
                  const p = peaks[name]
                  const last = exp?.steps?.[exp.steps.length - 1]
                  const stability = exp ? (last?.success_rate > 0.1 ? 'Partial' : last?.success_rate > 0.3 ? 'Stable' : 'Collapsed') : '-'
                  const stabilityColor = stability === 'Collapsed' ? 'text-red-600' : stability === 'Stable' ? 'text-green-600' : 'text-orange-600'
                  return (
                    <tr key={name} className="hover:bg-gray-50">
                      <td className="border border-gray-200 px-3 py-2 font-semibold" style={{ color: EXP_CONFIG[name].color }}>
                        {EXP_CONFIG[name].label}
                      </td>
                      <td className="border border-gray-200 px-3 py-2 text-gray-600">{innovation}</td>
                      <td className="border border-gray-200 px-3 py-2 text-center">{exp?.total_steps ?? '-'}</td>
                      <td className="border border-gray-200 px-3 py-2 text-center font-mono font-semibold text-green-700">
                        {(p.rate * 100).toFixed(1)}%
                      </td>
                      <td className="border border-gray-200 px-3 py-2 text-center font-mono">{p.step}</td>
                      <td className="border border-gray-200 px-3 py-2 text-center font-mono">
                        {last ? `${(last.success_rate * 100).toFixed(1)}%` : '-'}
                      </td>
                      <td className={`border border-gray-200 px-3 py-2 text-center font-semibold ${stabilityColor}`}>
                        {stability}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* v9 三阶段分析 */}
        {v9 && (
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-3">Figure 2. v9 训练动态三阶段分析</h4>
            <div className="grid grid-cols-3 gap-3 mb-3">
              {[
                {
                  phase: 'Phase I: Rise',
                  range: 'Steps 1–27',
                  color: 'green',
                  bg: 'bg-green-50 border-green-200',
                  points: [
                    'Success rate: 0.547 → 0.848 (peak)',
                    'Entropy steadily decreasing: 0.625 → 0.541',
                    'KL loss minimal (< 0.01)',
                    'Policy converges on effective strategies',
                  ]
                },
                {
                  phase: 'Phase II: Decay',
                  range: 'Steps 28–40',
                  color: 'orange',
                  bg: 'bg-amber-50 border-amber-200',
                  points: [
                    'Success rate: 0.848 → 0.336',
                    'Entropy begins rising (0.497 → 0.661)',
                    'Reward variance increases',
                    'Policy begins to explore sub-optimal regions',
                  ]
                },
                {
                  phase: 'Phase III: Collapse',
                  range: 'Steps 41–58',
                  color: 'red',
                  bg: 'bg-red-50 border-red-200',
                  points: [
                    'Success rate: 0.121 → 0.020',
                    'Entropy spike: 0.507 → 1.148',
                    'KL loss surge: 0.063 → 0.18',
                    'Final: reward = -3.501, entropy → 0.314',
                  ]
                },
              ].map((p, i) => (
                <div key={i} className={`rounded-lg border p-3 ${p.bg}`}>
                  <div className={`font-semibold text-sm mb-1 text-${p.color}-700`}>{p.phase}</div>
                  <div className="text-xs text-gray-500 mb-2">{p.range}</div>
                  <ul className="space-y-1">
                    {p.points.map((pt, j) => (
                      <li key={j} className="text-xs text-gray-600 flex gap-1.5">
                        <span className="opacity-50 shrink-0">•</span>
                        <span>{pt}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 关键发现 */}
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Key Findings</h4>
          <div className="space-y-2">
            {[
              {
                num: 'F1',
                title: '普遍性的"上升—崩溃"模式',
                color: 'text-red-700 bg-red-50 border-red-200',
                content: '所有四个实验均表现出先上升后崩溃的训练动态。v6、v7在极短训练内崩溃（28-50步），v8凭借更好的SFT初始化和KL-cov loss维持了145步，但最终也出现性能退化。这表明该现象源于奖励设计而非超参数问题。',
              },
              {
                num: 'F2',
                title: 'v7 早期峰值（peak=93.4%）暗示高方差学习',
                color: 'text-amber-700 bg-amber-50 border-amber-200',
                content: 'v7在Step 14达到了93.4%的最高成功率，远超其他版本。但随后在Step 28完全崩溃（valid_action_ratio→0）。这种极高峰值后快速崩溃的模式说明KL-cov loss在短期内高度有效，但缺乏长程稳定机制。',
              },
              {
                num: 'F3',
                title: 'v8 展现最强鲁棒性',
                color: 'text-blue-700 bg-blue-50 border-blue-200',
                content: 'v8在145步训练中维持了成功率0.379，KL-cov loss + 500mol SFT初始化显著提升了训练稳定性。值得注意的是v8最终的valid_action_ratio为0.449，仍维持部分有效动作，说明策略退化但未完全崩溃。',
              },
              {
                num: 'F4',
                title: 'v9 熵爆炸揭示正则化不足',
                color: 'text-green-700 bg-green-50 border-green-200',
                content: 'v9在Steps 49-55出现熵从0.503骤升至1.148的异常，随后在Steps 57-58迅速崩溃至熵=0.314。这种"熵爆炸→熵坍缩"模式是典型的policy entropy collapse前兆，建议在v10中引入entropy regularization (entropy_coeff > 0) 或自适应KL惩罚。',
              },
            ].map((f, i) => (
              <div key={i} className={`rounded-lg border p-3 ${f.color}`}>
                <div className="flex gap-2 items-start">
                  <span className="font-bold text-xs px-1.5 py-0.5 rounded bg-white bg-opacity-60 shrink-0">{f.num}</span>
                  <div>
                    <div className="font-semibold text-xs mb-1">{f.title}</div>
                    <div className="text-xs opacity-80 leading-relaxed">{f.content}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 改进建议 */}
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Recommendations for v10</h4>
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: '🔧', title: 'Entropy 正则化', desc: '设置 entropy_coeff=0.01–0.05，防止策略熵在训练中后期崩溃。v9的熵爆炸现象表明模型需要更强的熵约束。' },
              { icon: '📊', title: 'KL 自适应控制', desc: '将固定 KL coef 改为自适应：当 success_rate 开始下降时自动收紧 KL 约束，防止 Phase II → III 的跃迁。' },
              { icon: '🎯', title: 'Curriculum 训练', desc: '从简单分子（1-2步路线）逐渐过渡到复杂目标（4-5步），防止模型在早期过拟合简单案例后失去泛化能力。' },
              { icon: '💾', title: 'Checkpoint 回滚', desc: '每20步保存检查点，当 success_rate 连续3步下降超过20%时触发早停并回滚到最佳状态，已知Peak@Step可精确定位。' },
            ].map((r, i) => (
              <div key={i} className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span>{r.icon}</span>
                  <span className="font-semibold text-xs text-gray-800">{r.title}</span>
                </div>
                <p className="text-xs text-gray-600 leading-relaxed">{r.desc}</p>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}

// ── 主组件 ────────────────────────────────────────────────────────────────
export default function TrainingMetricsView() {
  const { multiExpMetrics, multiExpLoading, fetchMultiExpMetrics } = useStore()
  const [activeTab, setActiveTab] = useState('overview')

  if (multiExpLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-gray-400 text-sm">加载实验指标中...</div>
      </div>
    )
  }

  if (!multiExpMetrics) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-gray-400">
          <div className="text-3xl mb-3">📊</div>
          <p className="mb-4 text-sm">暂无多实验对比数据</p>
          <button onClick={fetchMultiExpMetrics}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600">
            加载实验数据
          </button>
        </div>
      </div>
    )
  }

  // 构造多线图数据集
  const buildDatasets = (expNames) =>
    expNames.map(name => ({
      label: EXP_CONFIG[name].label,
      color: EXP_CONFIG[name].color,
      data: multiExpMetrics[name]?.steps ?? [],
    })).filter(d => d.data.length > 0)

  const allDatasets = buildDatasets(['v6', 'v7', 'v8', 'v9'])
  const tabs = [
    { id: 'overview', label: '总览对比' },
    { id: 'v9', label: 'v9 详情' },
    { id: 'v8', label: 'v8 详情' },
    { id: 'analysis', label: '分析报告' },
  ]

  return (
    <div className="flex-1 flex flex-col overflow-y-auto bg-gray-50">
      <div className="p-6 max-w-5xl mx-auto w-full space-y-5">

        {/* 标题 */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Retro-GiGPO 训练曲线</h2>
            <p className="text-sm text-gray-500 mt-0.5">v6–v9 多实验对比分析 · 逆合成路径搜索</p>
          </div>
          <button onClick={fetchMultiExpMetrics}
            className="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600">
            刷新数据
          </button>
        </div>

        {/* 标签栏 */}
        <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-1 w-fit">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── 总览 ── */}
        {activeTab === 'overview' && (
          <div className="space-y-5">

            {/* 关键指标摘要 */}
            <div className="grid grid-cols-4 gap-3">
              {['v6', 'v7', 'v8', 'v9'].map(name => {
                const exp = multiExpMetrics[name]
                if (!exp?.steps?.length) return null
                const peak = exp.steps.reduce((a, b) => (b.success_rate ?? 0) > (a.success_rate ?? 0) ? b : a, exp.steps[0])
                const last = exp.steps[exp.steps.length - 1]
                const cfg = EXP_CONFIG[name]
                return (
                  <div key={name} className="bg-white rounded-lg border border-gray-200 p-3.5"
                    style={{ borderTop: `3px solid ${cfg.color}` }}>
                    <div className="font-semibold text-sm text-gray-800 mb-3">{cfg.label}</div>
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">Steps</span>
                        <span className="font-mono font-medium">{exp.total_steps}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">Peak SR</span>
                        <span className="font-mono font-medium text-green-700">
                          {(peak.success_rate * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">Peak@</span>
                        <span className="font-mono">Step {peak.step}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">Final SR</span>
                        <span className={`font-mono font-medium ${last.success_rate > 0.1 ? 'text-green-700' : 'text-red-600'}`}>
                          {(last.success_rate * 100).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* 对比图表 */}
            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <div className="mb-3">
                <h3 className="font-semibold text-gray-800 text-sm">Figure 1. Success Rate — Multi-Experiment Comparison</h3>
                <p className="text-xs text-gray-400 mt-0.5">All experiments share the same retrosynthesis task and evaluation protocol</p>
              </div>
              <SVGMultiLineChart
                datasets={allDatasets}
                yKey="success_rate"
                height={200}
                yLabel="Success Rate"
                showPhaseAnnotations={false}
              />
              <Legend items={allDatasets.map(d => ({ label: d.label, color: d.color }))} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <h3 className="font-semibold text-gray-700 text-xs mb-3">Figure 2. Reward Mean</h3>
                <SVGMultiLineChart datasets={allDatasets} yKey="reward_mean" height={160} />
                <Legend items={allDatasets.map(d => ({ label: d.label, color: d.color }))} />
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <h3 className="font-semibold text-gray-700 text-xs mb-3">Figure 3. Policy Entropy</h3>
                <SVGMultiLineChart datasets={allDatasets} yKey="entropy" height={160} />
                <Legend items={allDatasets.map(d => ({ label: d.label, color: d.color }))} />
              </div>
            </div>
          </div>
        )}

        {/* ── v9 详情 ── */}
        {activeTab === 'v9' && multiExpMetrics.v9 && (
          <div className="space-y-4">
            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <div className="mb-3">
                <h3 className="font-semibold text-gray-800 text-sm">v9 Training Dynamics — 3-Phase Analysis</h3>
                <p className="text-xs text-gray-400 mt-0.5">Green=Rise (1-27), Yellow=Decay (28-40), Red=Collapse (41-58)</p>
              </div>
              <SVGMultiLineChart
                datasets={[{ label: 'v9 Success Rate', color: '#10b981', data: multiExpMetrics.v9.steps }]}
                yKey="success_rate"
                height={210}
                showPhaseAnnotations={true}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="text-xs font-medium text-gray-500 mb-2">Reward Mean (v9)</div>
                <SVGLineChart data={multiExpMetrics.v9.steps} yKey="reward_mean" color="#10b981" height={120} />
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="text-xs font-medium text-gray-500 mb-2">Policy Entropy (v9)</div>
                <SVGLineChart data={multiExpMetrics.v9.steps} yKey="entropy" color="#8b5cf6" height={120} />
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="text-xs font-medium text-gray-500 mb-2">KL Loss (v9)</div>
                <SVGLineChart data={multiExpMetrics.v9.steps} yKey="kl_loss" color="#f59e0b" height={120} />
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="text-xs font-medium text-gray-500 mb-2">Episode Length (v9)</div>
                <SVGLineChart data={multiExpMetrics.v9.steps} yKey="episode_length" color="#6b7280" height={120} />
              </div>
            </div>
            {/* 详细数据表 */}
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                <span className="font-semibold text-gray-700 text-sm">v9 Step-level Data</span>
              </div>
              <div className="overflow-x-auto max-h-64">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr>
                      {['Step', 'Reward', 'Success%', 'Entropy', 'KL Loss', 'Ep Len'].map(h => (
                        <th key={h} className="px-3 py-2 text-right first:text-left font-semibold text-gray-600 border-b border-gray-200">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {multiExpMetrics.v9.steps.map((s, i) => (
                      <tr key={i} className={`hover:bg-gray-50 ${s.step >= 41 ? 'bg-red-50' : s.step >= 28 ? 'bg-amber-50' : ''}`}>
                        <td className="px-3 py-1.5 font-mono text-gray-700">{s.step}</td>
                        <td className={`px-3 py-1.5 text-right font-mono ${s.reward_mean > 0 ? 'text-green-600' : 'text-red-500'}`}>
                          {s.reward_mean?.toFixed(3)}
                        </td>
                        <td className={`px-3 py-1.5 text-right font-mono ${s.success_rate > 0.5 ? 'text-green-600 font-semibold' : s.success_rate < 0.1 ? 'text-red-500' : 'text-gray-700'}`}>
                          {(s.success_rate * 100).toFixed(1)}%
                        </td>
                        <td className={`px-3 py-1.5 text-right font-mono ${s.entropy > 1.0 ? 'text-purple-600 font-semibold' : 'text-gray-600'}`}>
                          {s.entropy?.toFixed(3)}
                        </td>
                        <td className={`px-3 py-1.5 text-right font-mono ${s.kl_loss > 0.1 ? 'text-orange-600' : 'text-gray-600'}`}>
                          {s.kl_loss?.toFixed(4)}
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono text-gray-600">
                          {s.episode_length?.toFixed(1)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── v8 详情 ── */}
        {activeTab === 'v8' && multiExpMetrics.v8 && (
          <div className="space-y-4">
            <ExperimentPanel expName="v8" expData={multiExpMetrics.v8} />
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="text-xs font-medium text-gray-500 mb-2">Valid Action Ratio (v8)</div>
                <SVGLineChart data={multiExpMetrics.v8.steps} yKey="valid_action_ratio" color="#3b82f6" height={120} />
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="text-xs font-medium text-gray-500 mb-2">KL Loss (v8)</div>
                <SVGLineChart data={multiExpMetrics.v8.steps} yKey="kl_loss" color="#f59e0b" height={120} />
              </div>
            </div>
          </div>
        )}

        {/* ── 分析报告 ── */}
        {activeTab === 'analysis' && (
          <ResearchAnalysis allData={multiExpMetrics} />
        )}

      </div>
    </div>
  )
}
