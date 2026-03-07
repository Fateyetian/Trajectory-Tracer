import { useState, useRef, useEffect } from 'react'

const EXPORT_OPTIONS = [
  { format: 'markdown', label: 'Markdown (.md)', desc: '结构化轨迹文档', icon: '📄' },
  { format: 'prompt',   label: 'Prompt (.json)', desc: 'SFT 训练格式',   icon: '🤖' },
  { format: 'pdf',      label: 'PDF (.pdf)',     desc: '可打印文档',      icon: '📑' },
]

export default function ExportMenu({ trajectoryId }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(null)
  const menuRef = useRef(null)

  // 点击外部关闭菜单
  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleExport = async (format) => {
    setLoading(format)
    setOpen(false)
    try {
      const resp = await fetch(`/api/trajectories/${trajectoryId}/export?format=${format}`)
      if (!resp.ok) throw new Error(resp.statusText)
      const disposition = resp.headers.get('Content-Disposition') || ''
      const fileName =
        disposition.match(/filename="([^"]+)"/)?.[1] ||
        `trajectory_${trajectoryId}.${format === 'markdown' ? 'md' : format === 'prompt' ? 'json' : format}`
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      alert(`导出失败: ${err.message}`)
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="relative self-start" ref={menuRef}>
      <button
        onClick={() => setOpen(v => !v)}
        disabled={loading !== null}
        className="text-sm text-white bg-gray-600 hover:bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 font-medium transition-colors shadow-sm flex items-center gap-2 disabled:opacity-60"
        title="导出轨迹"
      >
        {loading !== null ? (
          <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4" />
          </svg>
        )}
        导出 ▾
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-gray-200 rounded-lg shadow-lg z-50 overflow-hidden">
          {EXPORT_OPTIONS.map(opt => (
            <button
              key={opt.format}
              onClick={() => handleExport(opt.format)}
              className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-start gap-3 border-b border-gray-100 last:border-0"
            >
              <span className="text-lg leading-none mt-0.5">{opt.icon}</span>
              <div>
                <div className="text-sm font-medium text-gray-800">{opt.label}</div>
                <div className="text-xs text-gray-500">{opt.desc}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
