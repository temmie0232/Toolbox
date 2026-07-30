import { enable, isEnabled } from '@tauri-apps/plugin-autostart'
import { useEffect } from 'react'
import { Route, HashRouter as Router, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { ModeProvider } from './lib/mode'
import { BrainstormDetail } from './pages/BrainstormDetail'
import { BrainstormList } from './pages/BrainstormList'
import { BrainstormNew } from './pages/BrainstormNew'
import { MeetingDetail } from './pages/MeetingDetail'
import { MeetingList } from './pages/MeetingList'
import { MeetingNew } from './pages/MeetingNew'
import { MemoDetail, MemoNew } from './pages/MemoEdit'
import { MemoList } from './pages/MemoList'
import { Settings } from './pages/Settings'
import { TaskDetail } from './pages/TaskDetail'
import { TaskList } from './pages/TaskList'
import { TaskNew } from './pages/TaskNew'
import { initStore, useStore } from './store'

export function App() {
  const { status, error } = useStore()

  useEffect(() => {
    void initStore()
  }, [])

  // 常駐アプリなので、初回起動時だけログオン時の自動起動を入れる。
  // 一度ユーザーが設定画面で切ったら、二度と勝手には戻さない。
  // 開発ビルドでは行わない(デバッグ用のexeが自動起動に登録されてしまうため)
  useEffect(() => {
    if (!import.meta.env.PROD) return
    const KEY = 'tool:autostart-initialized'
    if (localStorage.getItem(KEY)) return
    void (async () => {
      try {
        if (!(await isEnabled())) await enable()
        localStorage.setItem(KEY, '1')
      } catch {
        // 自動起動を登録できなくてもアプリ自体は使える
      }
    })()
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
      {/* 移動 / 入力の2モード。全画面がこれを見て振る舞いを変える */}
      <ModeProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<TaskList />} />
            <Route path="tasks/new" element={<TaskNew />} />
            <Route path="tasks/:id" element={<TaskDetail />} />
            <Route path="memos" element={<MemoList />} />
            <Route path="memos/new" element={<MemoNew />} />
            <Route path="memos/:id" element={<MemoDetail />} />
            <Route path="meetings" element={<MeetingList />} />
            <Route path="meetings/new" element={<MeetingNew />} />
            <Route path="meetings/:id" element={<MeetingDetail />} />
            <Route path="brainstorms" element={<BrainstormList />} />
            <Route path="brainstorms/new" element={<BrainstormNew />} />
            <Route path="brainstorms/:id" element={<BrainstormDetail />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<TaskList />} />
          </Route>
        </Routes>
      </ModeProvider>
    </Router>
  )
}
