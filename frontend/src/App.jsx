import { useEffect } from 'react'
import { useStore } from './store'
import Header from './components/Header'
import TrajectoryList from './components/TrajectoryList'
import TrajectoryViewer from './components/TrajectoryViewer'
import FilterPanel from './components/FilterPanel'

function App() {
  const { fetchTrajectories, fetchStatistics, currentTrajectory } = useStore()

  useEffect(() => {
    fetchTrajectories()
    fetchStatistics()
  }, [])

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <Header />

      <div className="flex-1 flex overflow-hidden">
        {/* 左侧：轨迹列表 */}
        <div className="w-80 flex flex-col bg-white border-r border-gray-200">
          <FilterPanel />
          <TrajectoryList />
        </div>

        {/* 右侧：轨迹详情 */}
        <div className="flex-1 flex flex-col">
          {currentTrajectory ? (
            <TrajectoryViewer />
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-400">
              <div className="text-center">
                <svg className="mx-auto h-12 w-12 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <p className="text-lg">选择一条轨迹查看详情</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default App
