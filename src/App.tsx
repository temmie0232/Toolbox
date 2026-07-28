import { useEffect } from 'react'
import { Route, HashRouter as Router, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Backup } from './pages/Backup'
import { MemoDetail, MemoNew } from './pages/MemoEdit'
import { MemoList } from './pages/MemoList'
import { TaskDetail } from './pages/TaskDetail'
import { TaskList } from './pages/TaskList'
import { TaskNew } from './pages/TaskNew'
import { initStore, useStore } from './store'

export function App() {
  const { status, error } = useStore()

  useEffect(() => {
    void initStore()
  }, [])

  if (status === 'error') {
    return (
      <div className="mx-auto max-w-lg px-6 py-16">
        <h1 className="text-base font-semibold text-red-700">データを開けませんでした</h1>
        <p className="mt-2 text-sm text-neutral-700">{error}</p>
        <p className="mt-4 text-xs text-neutral-500">
          保存先(%APPDATA%\jp.temmie0232.tool\data.json)を開けませんでした。
        </p>
      </div>
    )
  }

  // 読み込みが終わる前に操作させない。
  // 空のまま書き込むと、保存済みのデータを空で上書きしてしまう
  if (status === 'loading') {
    return <p className="px-6 py-16 text-center text-sm text-neutral-400">読み込み中…</p>
  }

  return (
    <Router>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<TaskList />} />
          <Route path="tasks/new" element={<TaskNew />} />
          <Route path="tasks/:id" element={<TaskDetail />} />
          <Route path="memos" element={<MemoList />} />
          <Route path="memos/new" element={<MemoNew />} />
          <Route path="memos/:id" element={<MemoDetail />} />
          <Route path="backup" element={<Backup />} />
          <Route path="*" element={<TaskList />} />
        </Route>
      </Routes>
    </Router>
  )
}
