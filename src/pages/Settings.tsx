import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart'
import { useEffect, useState } from 'react'
import { exportBackup, pickBackup } from '../lib/backup'
import { formatDateTime } from '../lib/date'
import { dataFilePath, openDataDir } from '../storage'
import { clearAllData, markBackedUp, replaceAllData, useStore } from '../store'

type Notice = { kind: 'ok' | 'error'; text: string } | null

export function Settings() {
  const { tasks, memos, meetings, brainstorms, lastBackupAt } = useStore()
  const [notice, setNotice] = useState<Notice>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [path, setPath] = useState('')
  const [autostart, setAutostart] = useState<boolean | null>(null)

  useEffect(() => {
    void dataFilePath()
      .then(setPath)
      .catch(() => setPath(''))
  }, [])

  useEffect(() => {
    void isEnabled()
      .then(setAutostart)
      .catch(() => setAutostart(null))
  }, [])

  const fail = (e: unknown) =>
    setNotice({ kind: 'error', text: e instanceof Error ? e.message : String(e) })

  const toggleAutostart = async () => {
    try {
      if (autostart) await disable()
      else await enable()
      setAutostart(await isEnabled())
    } catch (e) {
      fail(e)
    }
  }

  const onExport = async () => {
    try {
      const saved = await exportBackup(tasks, memos, meetings, brainstorms)
      if (saved) {
        await markBackedUp()
        setNotice({ kind: 'ok', text: `書き出しました: ${saved}` })
      }
    } catch (e) {
      fail(e)
    }
  }

  const onImport = async () => {
    try {
      const picked = await pickBackup()
      if (!picked) return
      await replaceAllData(picked.tasks, picked.memos, picked.meetings, picked.brainstorms)
      // 読み込めた = そのファイルが手元にある = バックアップ済みとみなす
      await markBackedUp()
      setNotice({
        kind: 'ok',
        text: `読み込みました(タスク${picked.tasks.length}件 / メモ${picked.memos.length}件 / 議事録${picked.meetings.length}件)。既存データはこの内容で置き換えました。`,
      })
    } catch (e) {
      fail(e)
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900">設定</h1>
        <p className="mt-1 text-xs text-neutral-500">
          データはこのPCの中だけに保存され、外部には一切送信しません。
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-neutral-900">常駐</h2>
        <p className="text-xs text-neutral-500">
          閉じても終了せず、通知領域に常駐します。<kbd>Ctrl</kbd> <kbd>Alt</kbd> <kbd>T</kbd>{' '}
          でどこからでも呼び出せます(もう一度押すと隠れる)。完全に終了するには、通知領域のアイコンを右クリックして「終了」。
        </p>
        <label className="flex w-fit items-center gap-2 text-sm text-neutral-800">
          <input
            type="checkbox"
            className="size-4 accent-blue-600"
            checked={autostart === true}
            disabled={autostart === null}
            onChange={() => void toggleAutostart()}
          />
          Windowsのログオン時に自動で常駐を開始する
        </label>
        {autostart === null && (
          <p className="text-xs text-neutral-400">自動起動の状態を取得できませんでした。</p>
        )}
      </section>

      <section className="space-y-2 border-t border-neutral-100 pt-6">
        <h2 className="text-sm font-semibold text-neutral-900">データ</h2>
        <div className="space-y-1 rounded-lg border border-neutral-200 px-4 py-3 text-sm text-neutral-700">
          <p>
            タスク <strong>{tasks.length}</strong> 件 / メモ <strong>{memos.length}</strong> 件 /
            議事録 <strong>{meetings.length}</strong> 件 / ブレスト{' '}
            <strong>{brainstorms.length}</strong> 件
          </p>
          <p className="text-xs text-neutral-500">
            最終バックアップ:{' '}
            {lastBackupAt ? formatDateTime(lastBackupAt) : 'まだ書き出していません'}
          </p>
          {path && <p className="font-mono text-xs break-all text-neutral-500">{path}</p>}
        </div>
        <button type="button" className="btn-ghost" onClick={() => void openDataDir()}>
          保存先のフォルダを開く
        </button>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-neutral-900">バックアップ</h2>
        <p className="text-xs text-neutral-500">
          タスク・メモ・議事録・ブレストを1つのJSONファイルとして保存します。復元手段はこのファイルだけです。
          <br />
          <strong>録音した音声はJSONに含まれません。</strong>
          必要なら「保存先のフォルダを開く」から recordings フォルダごとコピーしてください。
        </p>
        <div className="flex gap-2">
          <button type="button" className="btn-primary" onClick={() => void onExport()}>
            JSONで書き出す
          </button>
          <button type="button" className="btn-ghost" onClick={() => void onImport()}>
            JSONを読み込む
          </button>
        </div>
        <p className="text-xs text-neutral-500">
          読み込むと<strong>いまのデータはファイルの内容で置き換わります</strong>(追加ではありません)。
        </p>
      </section>

      <section className="space-y-2 border-t border-neutral-100 pt-6">
        <h2 className="text-sm font-semibold text-neutral-900">全データ削除</h2>
        <p className="text-xs text-neutral-500">先に書き出してから実行してください。</p>
        {confirmClear ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-neutral-700">本当に全部消しますか?</span>
            <button
              type="button"
              className="btn-danger"
              onClick={() => {
                void clearAllData().then(() => {
                  setConfirmClear(false)
                  setNotice({ kind: 'ok', text: '全データを削除しました。' })
                })
              }}
            >
              全部消す
            </button>
            <button type="button" className="btn-ghost" onClick={() => setConfirmClear(false)}>
              やめる
            </button>
          </div>
        ) : (
          <button type="button" className="btn-danger" onClick={() => setConfirmClear(true)}>
            全データを削除
          </button>
        )}
      </section>

      {notice && (
        <p
          className={`text-sm break-all ${notice.kind === 'ok' ? 'text-emerald-700' : 'text-red-600'}`}
        >
          {notice.text}
        </p>
      )}
    </div>
  )
}
