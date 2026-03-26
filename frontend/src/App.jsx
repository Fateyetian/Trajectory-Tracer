import { useEffect, useState } from 'react'
import { useStore } from './store'
import Header from './components/Header'
import TrajectoryList from './components/TrajectoryList'
import TrajectoryViewer from './components/TrajectoryViewer'
import FilterPanel from './components/FilterPanel'
import TrajectoryComparison from './components/retrosynthesis/TrajectoryComparison'
import TrajectoryGroupView from './components/TrajectoryGroupView'
import TrainingMetricsView from './components/TrainingMetricsView'
import PromptCompareView from './components/PromptCompareView'

const TABS = [
  { id: 'list',    label: '轨迹列表', icon: '📋' },
  { id: 'groups',  label: '任务分组', icon: '🔗' },
  { id: 'metrics', label: '训练曲线', icon: '📊' },
  { id: 'prompts', label: 'Prompt 对比', icon: '🔍' },
]

function TabBar({ currentView, onTabChange }) {
  return (
    <div className="flex border-b border-gray-200 bg-white flex-shrink-0">
      {TABS.map(tab => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium transition-colors border-b-2 ${
            currentView === tab.id
              ? 'text-blue-600 border-blue-500 bg-blue-50/50'
              : 'text-gray-500 border-transparent hover:text-gray-800 hover:bg-gray-50'
          }`}
        >
          <span>{tab.icon}</span>
          <span>{tab.label}</span>
        </button>
      ))}
    </div>
  )
}

function App() {
  const {
    fetchTrajectories, fetchStatistics, fetchSourceFiles,
    currentTrajectory, showComparison,
    currentView, setCurrentView,
  } = useStore()

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  useEffect(() => {
    fetchTrajectories()
    fetchStatistics()
    fetchSourceFiles()
  }, [])

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      {/* 顶部 Header */}
      <Header />

      {/* 统计详情面板由 Header 内部控制 */}

      {/* Tab 导航 */}
      <TabBar currentView={currentView} onTabChange={setCurrentView} />

      {/* 主内容区 */}
      {currentView === 'list' && (
        <div className="flex-1 flex overflow-hidden">

          {/* 左侧：筛选 + 列表（可折叠） */}
          {sidebarCollapsed ? (
            /* 折叠态：36px 竖条 */
            <div className="w-9 flex-shrink-0 border-r border-gray-200 bg-white flex flex-col items-center py-3 gap-2">
              <button
                onClick={() => setSidebarCollapsed(false)}
                className="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-50 border border-gray-200 text-gray-500 hover:text-gray-800 hover:bg-gray-100 shadow-sm transition-colors text-base font-bold"
                title="展开侧栏"
              >›</button>
              <span
                className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest select-none mt-1"
                style={{ writingMode: 'vertical-rl', letterSpacing: '0.15em' }}
              >Trajs</span>
            </div>
          ) : (
            <div className="w-80 flex flex-col bg-white border-r border-gray-200 flex-shrink-0 overflow-hidden relative">
              {/* 折叠按钮条 */}
              <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-100 flex-shrink-0 bg-gray-50">
                <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">筛选 &amp; 列表</span>
                <button
                  onClick={() => setSidebarCollapsed(true)}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 border border-transparent hover:border-indigo-200 transition-all"
                  title="折叠侧栏 (隐藏筛选列表)"
                >
                  <span>‹‹</span>
                  <span>折叠</span>
                </button>
              </div>
              <FilterPanel />
              <TrajectoryList />
            </div>
          )}

          {/* 右侧：轨迹详情 */}
          <div className="flex-1 flex flex-col min-w-0">
            {currentTrajectory ? (
              <TrajectoryViewer />
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-400">
                <div className="text-center">
                  <svg className="mx-auto h-12 w-12 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  <p className="text-lg font-medium">选择一条轨迹查看详情</p>
                  <p className="text-sm mt-1 text-gray-300">从左侧列表点击任意轨迹</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {currentView === 'groups' && (
        <div className="flex-1 overflow-hidden">
          <TrajectoryGroupView />
        </div>
      )}

      {currentView === 'metrics' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <TrainingMetricsView />
        </div>
      )}

      {currentView === 'prompts' && (
        <div className="flex-1 overflow-hidden flex flex-col">
          <PromptCompareView />
        </div>
      )}

      {/* 逆合成对比全屏弹层 */}
      {showComparison && <TrajectoryComparison />}
    </div>
  )
}

export default App
