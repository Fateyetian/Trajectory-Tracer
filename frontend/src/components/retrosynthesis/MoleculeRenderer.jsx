import { useEffect, useState } from 'react'
import { renderMoleculeSVG } from '../../utils/rdkitInstance'

export default function MoleculeRenderer({ smiles, width = 200, height = 150, isRoot = false, isLeaf = false }) {
  const [svg, setSvg] = useState('')
  const [valid, setValid] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!smiles) return
    let cancelled = false
    setLoading(true)

    renderMoleculeSVG(smiles, width, height)
      .then(({ svg, valid }) => {
        if (cancelled) return
        setSvg(svg)
        setValid(valid)
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setValid(false)
        setLoading(false)
      })

    return () => { cancelled = true }
  }, [smiles, width, height])

  const borderColor = isRoot
    ? 'border-purple-400 shadow-purple-100'
    : isLeaf
      ? 'border-green-400 shadow-green-100'
      : 'border-gray-300'

  const bgColor = isRoot
    ? 'bg-purple-50'
    : isLeaf
      ? 'bg-green-50'
      : 'bg-white'

  const truncatedSmiles = smiles.length > 28 ? smiles.slice(0, 25) + '...' : smiles

  return (
    <div className={`flex flex-col items-center rounded-lg border-2 shadow-sm ${borderColor} ${bgColor} p-2`}>
      {isRoot && (
        <div className="text-xs font-semibold text-purple-700 mb-1">目标分子</div>
      )}
      {isLeaf && (
        <div className="text-xs font-semibold text-green-700 mb-1">起始原料</div>
      )}

      {loading ? (
        <div
          className="flex items-center justify-center text-xs text-gray-400"
          style={{ width, height }}
        >
          加载中...
        </div>
      ) : valid === false ? (
        <div
          className="flex flex-col items-center justify-center bg-red-50 rounded text-xs p-2"
          style={{ width, minHeight: height * 0.6, maxWidth: width }}
        >
          <span className="text-red-500 font-semibold mb-1">无效 SMILES</span>
          <span className="text-gray-500 font-mono break-all text-center">{smiles}</span>
        </div>
      ) : (
        <div
          className="molecule-svg"
          style={{ width, height }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      )}

      <div className="flex items-center gap-1 mt-1">
        {valid === true && (
          <span className="inline-block w-2 h-2 rounded-full bg-green-400 flex-shrink-0" title="有效 SMILES" />
        )}
        {valid === false && (
          <span className="inline-block w-2 h-2 rounded-full bg-red-400 flex-shrink-0" title="无效 SMILES" />
        )}
        <span className="text-xs text-gray-500 font-mono truncate max-w-[180px]" title={smiles}>
          {truncatedSmiles}
        </span>
      </div>
    </div>
  )
}
