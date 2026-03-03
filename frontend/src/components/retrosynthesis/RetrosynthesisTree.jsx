import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { buildRetrosynthesisTree } from '../../utils/buildRetrosynthesisTree'
import MoleculeRenderer from './MoleculeRenderer'

let nodeIdCounter = 0

function assignIds(node) {
  node.id = `node-${nodeIdCounter++}`
  for (const child of node.children) {
    assignIds(child)
  }
  return node
}

function TreeNodeRecursive({ node, isRoot, nodeRefs }) {
  const nodeRef = useRef(null)
  const isLeaf = node.children.length === 0

  useEffect(() => {
    if (nodeRef.current) {
      nodeRefs.current.set(node.id, nodeRef.current)
    }
    return () => {
      nodeRefs.current.delete(node.id)
    }
  }, [node.id, nodeRefs])

  return (
    <div className="flex flex-col items-center">
      <div ref={nodeRef} className="molecule-node" data-node-id={node.id}>
        <MoleculeRenderer
          smiles={node.smiles}
          width={isRoot ? 220 : 180}
          height={isRoot ? 160 : 130}
          isRoot={isRoot}
          isLeaf={isLeaf}
        />
      </div>
      {node.children.length > 0 && (
        <div className="flex items-start gap-8 mt-10">
          {node.children.map((child) => (
            <TreeNodeRecursive
              key={child.id}
              node={child}
              isRoot={false}
              nodeRefs={nodeRefs}
            />
          ))}
        </div>
      )}
    </div>
  )
}

const MIN_HEIGHT = 200
const DEFAULT_HEIGHT = 420
const MAX_HEIGHT = 1200
const ZOOM_MIN = 0.25
const ZOOM_MAX = 2.5
const ZOOM_STEP = 0.25

export default function RetrosynthesisTree({ targetMolecule, finalPathway }) {
  const scrollContainerRef = useRef(null)
  const innerRef = useRef(null)
  const nodeRefs = useRef(new Map())
  const [lines, setLines] = useState([])
  const [innerSize, setInnerSize] = useState({ width: 0, height: 0 })
  const [collapsed, setCollapsed] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [panelHeight, setPanelHeight] = useState(DEFAULT_HEIGHT)
  const [zoom, setZoom] = useState(1)
  const dragging = useRef(false)
  const startY = useRef(0)
  const startH = useRef(0)

  const tree = useMemo(() => {
    nodeIdCounter = 0
    const raw = buildRetrosynthesisTree(targetMolecule, finalPathway)
    return assignIds(raw)
  }, [targetMolecule, finalPathway])

  // 切换轨迹时重置缩放
  useEffect(() => {
    setZoom(1)
  }, [targetMolecule, finalPathway])

  const computeLines = useCallback(() => {
    if (!innerRef.current) return

    const inner = innerRef.current
    const innerRect = inner.getBoundingClientRect()

    // scrollWidth/Height 是未缩放尺寸，用于 SVG 坐标空间
    setInnerSize({
      width: inner.scrollWidth,
      height: inner.scrollHeight,
    })

    const newLines = []

    function traverse(node) {
      const parentEl = nodeRefs.current.get(node.id)
      if (!parentEl || node.children.length === 0) return

      const parentRect = parentEl.getBoundingClientRect()
      // getBoundingClientRect 返回屏幕缩放后坐标，除以 zoom 还原到 SVG 坐标空间
      const parentX = (parentRect.left + parentRect.width / 2 - innerRect.left) / zoom
      const parentY = (parentRect.top + parentRect.height - innerRect.top) / zoom

      for (const child of node.children) {
        const childEl = nodeRefs.current.get(child.id)
        if (!childEl) continue

        const childRect = childEl.getBoundingClientRect()
        const childX = (childRect.left + childRect.width / 2 - innerRect.left) / zoom
        const childY = (childRect.top - innerRect.top) / zoom

        const midY = (parentY + childY) / 2

        newLines.push({
          key: `${node.id}-${child.id}`,
          d: `M ${parentX} ${parentY} L ${parentX} ${midY} L ${childX} ${midY} L ${childX} ${childY}`,
        })

        traverse(child)
      }
    }

    traverse(tree)
    setLines(newLines)
  }, [tree, zoom])

  useEffect(() => {
    if (collapsed) return
    const timer = setTimeout(computeLines, 800)

    let resizeTimer
    const handleResize = () => {
      clearTimeout(resizeTimer)
      resizeTimer = setTimeout(computeLines, 200)
    }
    window.addEventListener('resize', handleResize)

    return () => {
      clearTimeout(timer)
      clearTimeout(resizeTimer)
      window.removeEventListener('resize', handleResize)
    }
  }, [computeLines, collapsed, fullscreen])

  // 缩放变化后重算连线
  useEffect(() => {
    if (!collapsed) {
      const timer = setTimeout(computeLines, 50)
      return () => clearTimeout(timer)
    }
  }, [zoom, collapsed, computeLines])

  // ESC 退出全屏
  useEffect(() => {
    if (!fullscreen) return
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setFullscreen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [fullscreen])

  // 全屏/面板高度切换后重算连线
  useEffect(() => {
    if (!collapsed) {
      const timer = setTimeout(computeLines, 300)
      return () => clearTimeout(timer)
    }
  }, [fullscreen, panelHeight, collapsed, computeLines])

  // 拖拽调节高度
  useEffect(() => {
    const onMouseMove = (e) => {
      if (!dragging.current) return
      const delta = startY.current - e.clientY
      const newH = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, startH.current + delta))
      setPanelHeight(newH)
    }
    const onMouseUp = () => {
      if (dragging.current) {
        dragging.current = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        setTimeout(computeLines, 100)
      }
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [computeLines])

  const handleDragStart = useCallback((e) => {
    if (fullscreen) return
    e.preventDefault()
    dragging.current = true
    startY.current = e.clientY
    startH.current = panelHeight
    document.body.style.cursor = 'ns-resize'
    document.body.style.userSelect = 'none'
  }, [panelHeight, fullscreen])

  const handleZoomIn = () => setZoom(z => Math.min(ZOOM_MAX, parseFloat((z + ZOOM_STEP).toFixed(2))))
  const handleZoomOut = () => setZoom(z => Math.max(ZOOM_MIN, parseFloat((z - ZOOM_STEP).toFixed(2))))
  const handleZoomReset = () => setZoom(1)

  // 滚轮缩放（按住 Ctrl）
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

  if (!tree) return null

  const wrapperCls = fullscreen
    ? 'fixed inset-0 z-50 bg-gradient-to-br from-green-50 to-emerald-50 flex flex-col'
    : 'border-t border-gray-200 bg-gradient-to-r from-green-50 to-emerald-50 min-w-0'

  return (
    <div className={wrapperCls}>
      {/* 拖拽手柄（非全屏时） */}
      {!fullscreen && (
        <div
          className="h-2 cursor-ns-resize bg-gradient-to-r from-green-200 to-emerald-200 hover:from-green-300 hover:to-emerald-300 flex items-center justify-center transition-colors"
          onMouseDown={handleDragStart}
          title="拖拽调节高度"
        >
          <div className="w-12 h-0.5 bg-green-400 rounded-full" />
        </div>
      )}

      <div className={`px-6 pt-3 pb-6 min-w-0 ${fullscreen ? 'flex-1 flex flex-col min-h-0' : ''}`}>
        <div className={`mx-auto min-w-0 ${fullscreen ? 'w-full flex-1 flex flex-col min-h-0' : 'max-w-full'}`}>
          {/* 标题栏 */}
          <div className="flex items-center gap-2 mb-3 flex-shrink-0 min-w-0">
            <span className="text-lg flex-shrink-0">🧬</span>
            <h3 className="text-lg font-bold text-gray-900 truncate">逆合成路径树</h3>
            <span className="text-sm text-gray-500 flex-shrink-0">
              ({finalPathway.length} 步)
            </span>
            <div className="ml-auto flex items-center gap-2 flex-shrink-0">
              {/* 缩放控件 */}
              {!collapsed && (
                <div className="flex items-center gap-1 bg-white border border-gray-300 rounded px-1 py-0.5">
                  <button
                    onClick={handleZoomOut}
                    disabled={zoom <= ZOOM_MIN}
                    className="w-6 h-6 flex items-center justify-center text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-base leading-none"
                    title="缩小"
                  >
                    −
                  </button>
                  <button
                    onClick={handleZoomReset}
                    className="px-1.5 text-xs font-mono text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors min-w-[3rem] text-center"
                    title="重置缩放"
                  >
                    {Math.round(zoom * 100)}%
                  </button>
                  <button
                    onClick={handleZoomIn}
                    disabled={zoom >= ZOOM_MAX}
                    className="w-6 h-6 flex items-center justify-center text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-base leading-none"
                    title="放大"
                  >
                    +
                  </button>
                </div>
              )}
              <button
                onClick={() => setFullscreen(f => !f)}
                className="text-sm text-gray-500 hover:text-gray-700 bg-white border border-gray-300 rounded px-3 py-1 transition-colors whitespace-nowrap"
              >
                {fullscreen ? '退出全屏' : '全屏'}
              </button>
              <button
                onClick={() => setCollapsed(c => !c)}
                className="text-sm text-gray-500 hover:text-gray-700 bg-white border border-gray-300 rounded px-3 py-1 transition-colors whitespace-nowrap"
              >
                {collapsed ? '展开树' : '收起树'}
              </button>
            </div>
          </div>

          {/* 树可视化区域 */}
          {!collapsed && (
            <div
              ref={scrollContainerRef}
              className={`relative bg-white rounded-lg border border-green-200 overflow-auto ${fullscreen ? 'flex-1 min-h-0' : ''}`}
              style={fullscreen ? {} : { height: panelHeight }}
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
                  className="relative p-6"
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
                    {lines.map((line) => (
                      <path
                        key={line.key}
                        d={line.d}
                        fill="none"
                        stroke="#94a3b8"
                        strokeWidth="2"
                        strokeDasharray="6,3"
                      />
                    ))}
                  </svg>

                  {/* 节点层 */}
                  <div className="relative flex justify-center" style={{ zIndex: 2 }}>
                    <TreeNodeRecursive
                      node={tree}
                      isRoot={true}
                      nodeRefs={nodeRefs}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 全屏提示 */}
          {fullscreen && (
            <div className="text-center text-xs text-gray-400 mt-2 flex-shrink-0">
              按 ESC 或点击「退出全屏」返回 · Ctrl+滚轮 缩放
            </div>
          )}

          {/* 原始路径文本折叠区 */}
          {!fullscreen && (
            <details className="mt-3">
              <summary className="text-sm text-gray-500 cursor-pointer hover:text-gray-700">
                查看原始反应路径文本
              </summary>
              <div className="mt-2 bg-white rounded-lg p-4 border border-green-200">
                <div className="space-y-2">
                  {finalPathway.map((reaction, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                      <div className="flex-shrink-0 w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                        <span className="text-sm font-bold text-green-700">{idx + 1}</span>
                      </div>
                      <div className="flex-1 font-mono text-sm text-gray-700 break-all">
                        {typeof reaction === 'string' ? reaction : JSON.stringify(reaction)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </details>
          )}
        </div>
      </div>
    </div>
  )
}
