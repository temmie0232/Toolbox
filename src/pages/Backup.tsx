import { useEffect, useState } from 'react'
import { exportBackup, pickBackup } from '../lib/backup'
import { formatDateTime } from '../lib/date'
import { dataFilePath } from '../storage'
import { clearAllData, markBackedUp, replaceAllData, useStore } from '../store'

type Notice = { kind: 'ok' | 'error'; text: string } | null

/**
 * F5 保存とバックアップ。
 * 本体データは %APPDATA% に常時保存されるが、PC乗り換えや事故に備えてJSONにも書き出せる。
 */
export function Backup() {
  const { tasks, memos, lastBackupAt } = useStore()
  const [notice, setNotice] = useState<Notice>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [path, setPath] = useState('')

  useEffect(() => {
    void dataFilePath()
      .then(setPath)
      .catch(() => setPath(''))
  }, [])

  const fail = (e: unknown) =>
    setNotice({ kind: 'error', text: e instanceof Error ? e.message : String(e) })

  const onExport = async () => {
    try {
      const saved = await exportBackup(tasks, memos)
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
      await replaceAllData(picked.tasks, picked.memos)
      // 読み込めた = そのファイルが手元にある = バックアップ済みとみなす
      await markBackedUp()
      setNotice({
        kind: 'ok',
        text: `読み込みました(タスク${picked.tasks.length}件 / メモ${picked.memos.length}件)。既存データはこの内容で置き換えました。`,
      })
    } catch (e) {
      fail(e)
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900">バックアップ</h1>
        <p className="mt-1 text-xs text-neutral-500">
          データはこのPCの中だけに保存され、外部には一切送信しません。
        </p>
      </div>

      <div className="space-y-1 rounded-lg border border-neutral-200 px-4 py-3 text-sm text-neutral-700">
        <p>
          現在のデータ: タスク <strong>{tasks.length}</strong> 件 / メモ{' '}
          <strong>{memos.length}</strong> 件
        </p>
        <p className="text-xs text-neutral-500">
          最終バックアップ: {lastBackupAt ? formatDateTime(lastBackupAt) : 'まだ書き出していません'}
        </p>
        {path && <p className="font-mono text-xs break-all text-neutral-500">{path}</p>}
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-neutral-900">書き出し</h2>
        <p className="text-xs text-neutral-500">全データを1つのJSONファイルとして保存します。</p>
        <button type="button" className="btn-primary" onClick={() => void onExport()}>
          JSONで書き出す
        </button>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-neutral-900">読み込み</h2>
        <p className="text-xs text-neutral-500">
          書き出したJSONを読み込みます。
          <strong>いまのデータはファイルの内容で置き換わります。</strong>
        </p>
        <button type="button" className="btn-ghost" onClick={() => void onImport()}>
          JSONを読み込む
        </button>
      </section>

      <section className="space-y-2 border-t border-neutral-100 pt-6">
        <h2 className="text-sm font-semibold text-neutral-900">全データ削除</h2>
        <p className="text-xs text-neutral-500">
          復元手段はJSONファイルだけです。先に書き出してから実行してください。
        </p>
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
