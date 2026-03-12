import { useMemo, useState, useCallback, useEffect, useRef } from 'react'
import { parseRetroV2Obs } from '../../utils/parseRetroV2Obs'
import MoleculeRenderer from './MoleculeRenderer'

const ZOOM_MIN = 0.35
const ZOOM_MAX = 2.0
const ZOOM_STEP = 0.15
const DEFAULT_ZOOM = 0.75

/**
 * Top-down centered AND/OR tree panel for one retrov2 step.
 * Each node is horizontally centered over its children.
 */
export default function RetroV2StepPanel({ humanMessage, stepData }) {
  const [zoom, setZoom] = useState(DEFAULT_ZOOM)
  const scrollRef = useRef(null)

  const parsedState = useMemo(() => {
    if (!humanMessage?.content) return null
    return parseRetroV2Obs(humanMessage.content)
  }, [humanMessage?.content])

  const treeState = stepData?.state ?? parsedState
  const prevState = stepData?.prevState ?? null
  const parentMap = stepData?.parentMap ?? {}

  const handleWheel = useCallback((e) => {
    if (!e.ctrlKey && !e.metaKey) return
    e.preventDefault()
    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP
    setZoom(z => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, parseFloat((z + delta).toFixed(2)))))
  }, [])
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  if (!treeState) return null

  const commercialCount = treeState.leafNodes.filter(n => n.status === 'commercial').length
  const totalLeaves = treeState.leafNodes.length

  // ── Diff ──────────────────────────────────────────────────────────────────
  const diffInfo = useMemo(() => {
    if (!prevState) return { newIds: new Set(), changedIds: new Map() }
    const prevAll = new Map([
      ...prevState.backboneNodes.map(n => [n.id, n]),
      ...prevState.leafNodes.map(n => [n.id, n]),
    ])
    const newIds = new Set()
    const changedIds = new Map()
    ;[...treeState.backboneNodes, ...treeState.leafNodes].forEach(n => {
      if (!prevAll.has(n.id)) newIds.add(n.id)
      else {
        const p = prevAll.get(n.id)
        if (p.status !== n.status) changedIds.set(n.id, { from: p.status, to: n.status })
      }
    })
    return { newIds, changedIds }
  }, [prevState, treeState])

  const hasDiff = diffInfo.newIds.size > 0 || diffInfo.changedIds.size > 0

  // ── Build tree ─────────────────────────────────────────────────────────────
  const { roots, childrenMap, nodeById } = useMemo(
    () => buildTree(treeState, parentMap),
    [treeState, parentMap]
  )

  return (
    <div className="bg-slate-50/50 border-b border-slate-200">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-slate-200">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className="text-sm">🌳</span>
          <span className="font-semibold text-slate-700 text-xs">AND/OR Tree</span>
          <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded text-[11px] font-mono font-bold">
            {treeState.stateId}
          </span>
          <span className="text-[11px] text-slate-400">
            depth {treeState.depth}/{treeState.maxDepth}
          </span>
          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
            treeState.isGenPhase ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
          }`}>
            {treeState.isGenPhase ? '⚗ GEN' : '🎯 SEL'}
          </span>
          {/* Leaf progress dots */}
          <div className="flex items-center gap-0.5 ml-1">
            {treeState.leafNodes.map(n => (
              <span key={n.id} title={`${n.id}: ${n.status}`}
                className={`w-2.5 h-2.5 rounded-full ${dotColor(n.status, diffInfo.newIds.has(n.id))}`}
              />
            ))}
            <span className="text-[11px] text-slate-400 ml-1 font-mono">
              {commercialCount}/{totalLeaves}
            </span>
          </div>
          {/* Diff badge */}
          {hasDiff && (
            <span className="text-[11px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">
              {diffInfo.newIds.size > 0 && `➕${diffInfo.newIds.size}`}
              {diffInfo.changedIds.size > 0 && ` 🔄${diffInfo.changedIds.size}`}
            </span>
          )}
        </div>

        {/* Zoom */}
        <div className="flex items-center gap-0.5 bg-slate-100 rounded px-1 py-0.5 flex-shrink-0">
          <button onClick={() => setZoom(z => Math.max(ZOOM_MIN, parseFloat((z - ZOOM_STEP).toFixed(2))))}
            disabled={zoom <= ZOOM_MIN}
            className="w-5 h-5 flex items-center justify-center text-slate-500 hover:bg-white rounded disabled:opacity-30">−</button>
          <button onClick={() => setZoom(DEFAULT_ZOOM)}
            className="px-1 text-[10px] font-mono text-slate-500 hover:bg-white rounded min-w-[2.4rem] text-center">
            {Math.round(zoom * 100)}%</button>
          <button onClick={() => setZoom(z => Math.min(ZOOM_MAX, parseFloat((z + ZOOM_STEP).toFixed(2))))}
            disabled={zoom >= ZOOM_MAX}
            className="w-5 h-5 flex items-center justify-center text-slate-500 hover:bg-white rounded disabled:opacity-30">+</button>
        </div>
      </div>

      {/* ── Diff bar ── */}
      {hasDiff && (
        <div className="flex items-center gap-3 px-4 py-1.5 bg-amber-50 border-b border-amber-100 flex-wrap text-[11px]">
          <span className="font-semibold text-amber-700 flex-shrink-0">本步变化：</span>
          {diffInfo.newIds.size > 0 && (
            <span className="text-emerald-700 flex items-center gap-1 flex-wrap">
              ➕ {[...diffInfo.newIds].map(id => (
                <span key={id} className="font-mono font-bold bg-emerald-100 px-1 rounded">{id}</span>
              ))}
            </span>
          )}
          {diffInfo.changedIds.size > 0 && (
            <span className="text-amber-700 flex items-center gap-1 flex-wrap">
              🔄 {[...diffInfo.changedIds.entries()].map(([id, { from, to }]) => (
                <span key={id} className="font-mono font-bold bg-amber-100 px-1 rounded">
                  {id}: {from} → {to}
                </span>
              ))}
            </span>
          )}
          {prevState && treeState.historyCount > prevState.historyCount && (
            <span className="text-red-600">✗ +{treeState.historyCount - prevState.historyCount} 失败分支</span>
          )}
        </div>
      )}

      {/* ── Tree body ── */}
      <div ref={scrollRef} className="overflow-auto">
        <div style={{ zoom }} className="p-6 w-fit min-w-full flex justify-center">
          {roots.length > 0 ? (
            <div className="flex gap-8">
              {roots.map(root => (
                <TreeNode
                  key={root.id}
                  nodeId={root.id}
                  nodeById={nodeById}
                  childrenMap={childrenMap}
                  candidates={treeState.candidateReactions}
                  isGenPhase={treeState.isGenPhase}
                  newIds={diffInfo.newIds}
                  changedIds={diffInfo.changedIds}
                />
              ))}
            </div>
          ) : (
            <FlatFallback state={treeState} newIds={diffInfo.newIds} />
          )}
        </div>
      </div>

    </div>
  )
}

/* ─── Build tree ─────────────────────────────────────────────────────────── */

function buildTree(state, parentMap) {
  if (!state) return { roots: [], childrenMap: {}, nodeById: {} }

  const focusId = state.backboneNodes[state.backboneNodes.length - 1]?.id

  const nodeById = {}
  state.backboneNodes.forEach((n, i) => {
    nodeById[n.id] = {
      ...n,
      isBackbone: true,
      isFocus: n.id === focusId,
      isExpanded: i < state.backboneNodes.length - 1,
    }
  })
  state.leafNodes.forEach(n => {
    if (nodeById[n.id]) {
      nodeById[n.id] = { ...nodeById[n.id], status: n.status }
    } else {
      nodeById[n.id] = { ...n, isBackbone: false, isFocus: false, isExpanded: false }
    }
  })

  const childrenMap = {}
  Object.keys(nodeById).forEach(id => { childrenMap[id] = [] })

  Object.entries(parentMap).forEach(([childId, parentId]) => {
    if (nodeById[childId] && nodeById[parentId]) {
      childrenMap[parentId].push(nodeById[childId])
    }
  })

  // Sort: backbone/expanded first, then numeric
  const sortChildren = arr => arr.sort((a, b) => {
    if (a.isBackbone && !b.isBackbone) return -1
    if (!a.isBackbone && b.isBackbone) return 1
    return a.id.localeCompare(b.id, undefined, { numeric: true })
  })
  Object.values(childrenMap).forEach(sortChildren)

  const hasParent = new Set(
    Object.entries(parentMap).filter(([k]) => nodeById[k]).map(([k]) => k)
  )
  const roots = Object.values(nodeById).filter(n => !hasParent.has(n.id))
  sortChildren(roots)

  return { roots, childrenMap, nodeById }
}

/* ─── TreeNode (top-down, centered over children) ────────────────────────── */

/**
 * Layout strategy:
 *   - This node is a flex-col items-center column.
 *   - Children are laid out horizontally in a row, each as a flex-col items-center column.
 *   - A horizontal connector line spans from the center of the first child to the center
 *     of the last child, drawn with an absolute-positioned div inside each child wrapper.
 *   - A short vertical line connects: parent card → horizontal connector → child card.
 */
function TreeNode({ nodeId, nodeById, childrenMap, candidates, isGenPhase, newIds, changedIds }) {
  const node = nodeById[nodeId]
  if (!node) return null

  const children = childrenMap[nodeId] ?? []
  const isNew     = newIds?.has(nodeId)
  const isChanged = changedIds?.has(nodeId)
  const showCandidates = node.isFocus && !isGenPhase && candidates?.length > 0
  const showGenNote    = node.isFocus && isGenPhase

  // Ordered list of subtree items (gen note | candidates | AND-children)
  const subItems = [
    ...(showGenNote    ? [{ type: 'gen' }] : []),
    ...(showCandidates ? [{ type: 'candidates' }] : []),
    ...children.map(c => ({ type: 'child', id: c.id })),
  ]
  const n = subItems.length

  return (
    <div className="flex flex-col items-center">

      {/* Node card – centered in its column */}
      <NodeCard node={node} isNew={isNew} isChanged={isChanged} />

      {n > 0 && (
        <>
          {/* Short vertical line from node card down to horizontal bar */}
          <div className="w-px bg-slate-300 flex-shrink-0" style={{ height: 16 }} />

          {/* Children row */}
          <div className="flex items-start">
            {subItems.map((item, i) => {
              const isFirst  = i === 0
              const isLast   = i === n - 1
              const isSingle = n === 1
              const isCandidate = item.type === 'candidates'

              // Horizontal connector colour
              const hColor = isCandidate ? '#fb923c' : '#cbd5e1'
              const vColor = isCandidate ? 'bg-orange-300' : 'bg-slate-300'

              const childContent =
                item.type === 'gen' ? (
                  <GenNote />
                ) : item.type === 'candidates' ? (
                  <CandidatesGroup candidates={candidates} />
                ) : (
                  <TreeNode
                    nodeId={item.id}
                    nodeById={nodeById}
                    childrenMap={childrenMap}
                    candidates={candidates}
                    isGenPhase={isGenPhase}
                    newIds={newIds}
                    changedIds={changedIds}
                  />
                )

              return (
                <div
                  key={item.type === 'child' ? item.id : item.type}
                  className="flex flex-col items-center px-3"
                  style={{ position: 'relative' }}
                >
                  {/* Horizontal connector segment (absolute, top of wrapper) */}
                  {!isSingle && (
                    <div style={{
                      position: 'absolute',
                      top: 0,
                      left:  isFirst  ? '50%' : 0,
                      right: isLast   ? '50%' : 0,
                      height: 1,
                      background: hColor,
                    }} />
                  )}
                  {/* Short vertical line from connector down to child */}
                  <div className={`w-px flex-shrink-0 ${vColor}`} style={{ height: 16 }} />
                  {/* Child node */}
                  {childContent}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

/* ─── Gen phase note ──────────────────────────────────────────────────────── */

function GenNote() {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5 text-xs text-blue-700 text-center whitespace-nowrap">
      <span className="font-semibold">⚗ Gen Phase</span><br />
      <code className="bg-blue-100 px-1 rounded text-[10px]">single_step_retro</code>
    </div>
  )
}

/* ─── Candidates group (OR options) ──────────────────────────────────────── */

function CandidatesGroup({ candidates }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className="text-[11px] font-bold text-orange-600 bg-orange-50 border border-orange-200 rounded px-2 py-0.5 whitespace-nowrap">
        OR — {candidates.length} candidate{candidates.length > 1 ? 's' : ''}
      </span>
      <div className="flex flex-wrap justify-center gap-2 max-w-[560px]">
        {candidates.map(rxn => <CandidateCard key={rxn.id} rxn={rxn} />)}
      </div>
    </div>
  )
}

/* ─── NodeCard ────────────────────────────────────────────────────────────── */

const STATUS_CFG = {
  commercial:        { ring: 'ring-green-400',  bg: 'bg-green-50',  label: '✓ commercial', lCls: 'bg-green-100 text-green-700' },
  pending:           { ring: 'ring-amber-400',  bg: 'bg-amber-50',  label: '⚠ pending',    lCls: 'bg-amber-100 text-amber-700' },
  pending_selection: { ring: 'ring-blue-400',   bg: 'bg-blue-50',   label: '🎯 selecting', lCls: 'bg-blue-100 text-blue-700' },
  pending_expansion: { ring: 'ring-violet-400', bg: 'bg-violet-50', label: '⚗ expanding', lCls: 'bg-violet-100 text-violet-700' },
  failed:            { ring: 'ring-red-400',    bg: 'bg-red-50',    label: '✗ failed',     lCls: 'bg-red-100 text-red-700' },
}

function NodeCard({ node, isNew, isChanged }) {
  const cfg = STATUS_CFG[node.status] || STATUS_CFG.pending

  const ringCls = isNew      ? 'ring-2 ring-emerald-400 shadow-md shadow-emerald-100'
                : isChanged  ? 'ring-2 ring-amber-400'
                : node.isFocus    ? 'ring-2 ring-blue-500 shadow-md shadow-blue-100'
                : node.isExpanded ? 'ring-1 ring-slate-300'
                : `ring-2 ${cfg.ring}`

  const bgCls = isNew ? 'bg-emerald-50' : node.isFocus ? 'bg-blue-50' : node.isExpanded ? 'bg-slate-50' : cfg.bg

  const statusLabel = isNew         ? '✨ new'
                    : node.isFocus    ? '🎯 focus'
                    : node.isExpanded ? '↳ expanded'
                    : cfg.label

  const statusCls = isNew         ? 'bg-emerald-100 text-emerald-700'
                  : node.isFocus    ? 'bg-blue-100 text-blue-700'
                  : node.isExpanded ? 'bg-slate-100 text-slate-500'
                  : cfg.lCls

  const molW = node.isFocus ? 110 : 85
  const molH = node.isFocus ? 82  : 64

  return (
    <div className={`flex flex-col items-center gap-1 rounded-xl px-2 py-1.5 ${bgCls} ${ringCls}`}>
      <MoleculeRenderer
        smiles={node.smiles}
        width={molW}
        height={molH}
        isRoot={node.id === 'N0'}
        isLeaf={node.status === 'commercial'}
      />
      <span className="text-[10px] font-mono font-bold text-slate-400">{node.id}</span>
      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${statusCls}`}>
        {statusLabel}
      </span>
    </div>
  )
}

/* ─── CandidateCard ───────────────────────────────────────────────────────── */

function CandidateCard({ rxn }) {
  return (
    <div className="flex items-start gap-1.5 bg-white border border-orange-200 rounded-xl px-2 py-1.5 shadow-sm">
      <span className="text-[10px] font-mono font-bold text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded-full flex-shrink-0">
        {rxn.id}
      </span>
      <div className="flex flex-wrap items-center gap-1">
        {rxn.precursors.map((p, i) => (
          <div key={i} className="flex items-center gap-1">
            {i > 0 && <span className="text-slate-300 font-bold select-none">+</span>}
            <div className={`flex flex-col items-center rounded-lg p-1 ring-1 ${
              p.available === true  ? 'ring-green-400 bg-green-50'
              : p.available === false ? 'ring-red-300 bg-red-50'
              : 'ring-slate-200 bg-slate-50'
            }`}>
              <MoleculeRenderer smiles={p.smiles} width={70} height={52} isLeaf={p.available === true} />
              <span className={`text-[10px] font-semibold mt-0.5 ${
                p.available === true ? 'text-green-600'
                : p.available === false ? 'text-red-500'
                : 'text-slate-400'
              }`}>
                {p.available === true ? '✓' : p.available === false ? '✗' : '?'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ─── FlatFallback (step 0, no parentMap yet) ─────────────────────────────── */

function FlatFallback({ state, newIds }) {
  if (!state) return null
  const root = state.backboneNodes[0]
  if (!root) return null
  return (
    <div className="flex flex-col items-center gap-3">
      <NodeCard
        node={{ ...root, isBackbone: true, isFocus: state.backboneNodes.length === 1, isExpanded: false }}
        isNew={newIds?.has(root.id)}
        isChanged={false}
      />
      {state.backboneNodes.length === 1 && state.isGenPhase && (
        <>
          <div className="w-px bg-slate-300" style={{ height: 16 }} />
          <GenNote />
        </>
      )}
    </div>
  )
}

/* ─── helpers ─────────────────────────────────────────────────────────────── */

function dotColor(status, isNew) {
  if (isNew) return 'bg-emerald-400'
  return {
    commercial:        'bg-green-400',
    pending_selection: 'bg-blue-400',
    pending_expansion: 'bg-violet-400',
    pending:           'bg-amber-400',
    failed:            'bg-red-400',
  }[status] ?? 'bg-slate-300'
}
