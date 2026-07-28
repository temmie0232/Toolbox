import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { InlineText } from '../components/InlineText'
import { formatDateTime } from '../lib/date'
import { REWIND_SECONDS, formatOffset, useRecording } from '../lib/useRecording'
import { useShortcuts } from '../lib/useShortcuts'
import {
  addMinuteBlock,
  convertTodoToTask,
  removeMeeting,
  removeMinuteBlock,
  updateMeetingWith,
  updateMinuteBlock,
  useStore,
} from '../store'
import {
  MINUTE_KIND_LABEL,
  MINUTE_KIND_ORDER,
  type Meeting,
  type MinuteKind,
  type Recording,
} from '../types'

const KIND_HINT: Record<MinuteKind, string> = {
  decision: '決まったこと',
  todo: '誰かがやること',
  issue: '決まらなかったこと',
}

export function MeetingDetail() {
  const { id = '' } = useParams()
  const { status, meetings } = useStore()
  const meeting = meetings.find((m) => m.id === id)

  if (status === 'loading') return <p className="text-sm text-neutral-500">読み込み中…</p>
  if (!meeting) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-neutral-600">この議事録は見つかりませんでした。</p>
        <Link to="/meetings" className="btn-ghost">
          議事録一覧へ
        </Link>
      </div>
    )
  }
  return <MeetingBody key={meeting.id} meeting={meeting} />
}

function MeetingBody({ meeting }: { meeting: Meeting }) {
  const navigate = useNavigate()
  const [kind, setKind] = useState<MinuteKind>('decision')
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const captureRef = useRef<HTMLInputElement>(null)

  const run = useCallback(async (work: () => Promise<unknown>) => {
    try {
      setError('')
      await work()
      return true
    } catch (e) {
      setError(`保存できませんでした: ${e instanceof Error ? e.message : String(e)}`)
      return false
    }
  }, [])

  const onRecordingFinished = useCallback(
    (recording: Recording) =>
      void run(() => updateMeetingWith(meeting.id, () => ({ recording }))),
    [meeting.id, run],
  )
  const rec = useRecording(meeting.id, meeting.recording, onRecordingFinished)

  const add = async () => {
    const value = text.trim()
    if (!value) return
    // 録音中なら、書いた瞬間の位置を覚えておく。あとでその前後を聞き返せる
    const offsetMs = rec.offsetNow()
    // 書き込みが通ってから消す。失敗したら打ち直しにならない
    const ok = await run(() => addMinuteBlock(meeting.id, { kind, text: value, offsetMs }))
    if (ok) setText('')
  }

  /** Ctrl+E で録音の開始・停止(入力欄に手を置いたまま操作できる) */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'e' && e.ctrlKey && !e.altKey && !e.shiftKey) {
        e.preventDefault()
        if (rec.status === 'recording') void rec.stop()
        else if (rec.status === 'idle' && !meeting.recording) void rec.start()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [rec, meeting.recording])

  const shortcuts = useMemo(
    () => ({
      Escape: () => navigate('/meetings'),
      h: () => navigate('/meetings'),
      a: () => captureRef.current?.focus(),
    }),
    [navigate],
  )
  useShortcuts(shortcuts)

  const grouped = useMemo(
    () =>
      MINUTE_KIND_ORDER.map((k) => ({
        kind: k,
        blocks: meeting.blocks.filter((b) => b.kind === k),
      })),
    [meeting.blocks],
  )

  return (
    <div className="space-y-6">
      {/* 会議の枠。会議中はほとんど触らないので小さく置く */}
      <div className="space-y-1">
        <InlineText
          value={meeting.title}
          onCommit={(v) => void run(() => updateMeetingWith(meeting.id, () => ({ title: v })))}
          placeholder="(会議名)"
          className="text-base font-medium"
          ariaLabel="会議名"
        />
        <div className="flex items-center gap-2 px-1 text-xs text-neutral-500">
          <span className="shrink-0">{formatDateTime(meeting.startedAt)}</span>
          <span className="shrink-0">/</span>
          <div className="flex-1">
            <InlineText
              value={meeting.participants}
              onCommit={(v) =>
                void run(() => updateMeetingWith(meeting.id, () => ({ participants: v })))
              }
              placeholder="(参加者)"
              className="text-xs"
              ariaLabel="参加者"
            />
          </div>
        </div>
      </div>

      {/*
        録音。空(事実)は録音に丸ごと任せて、人は雨・傘(決定・TODO・論点)だけ書く。
        逐語メモから解放されることが目的
      */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-neutral-200 px-3 py-2">
        {rec.status === 'recording' ? (
          <>
            <span className="flex items-center gap-2 text-sm font-medium text-red-600">
              <span className="size-2 animate-pulse rounded-full bg-red-600" />
              録音中 {formatOffset(rec.elapsedMs)}
            </span>
            <button type="button" className="btn-ghost" onClick={() => void rec.stop()}>
              停止 <kbd>Ctrl+E</kbd>
            </button>
          </>
        ) : meeting.recording ? (
          <>
            <span className="shrink-0 text-xs text-neutral-500">
              録音あり{' '}
              {meeting.recording.durationMs
                ? `(${formatOffset(meeting.recording.durationMs)})`
                : ''}
            </span>
            <audio
              ref={rec.audioRef}
              src={rec.audioUrl ?? undefined}
              controls
              preload="metadata"
              className="h-8 min-w-0 flex-1"
            />
            {!rec.audioUrl && (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => void rec.seekTo(0)}
                disabled={rec.loadingAudio}
              >
                {rec.loadingAudio ? '読み込み中…' : '再生の準備'}
              </button>
            )}
          </>
        ) : (
          <>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => void rec.start()}
              disabled={rec.status === 'stopping'}
            >
              録音を開始 <kbd>Ctrl+E</kbd>
            </button>
            <span className="text-xs text-neutral-400">
              録音していれば、書いた行から{REWIND_SECONDS}秒前を聞き返せる
            </span>
          </>
        )}
      </div>

      {rec.error && <p className="text-sm text-red-600">{rec.error}</p>}

      {/* 入力口はひとつ。種別を切り替えながら流し込む */}
      <div className="space-y-2 rounded-lg border border-neutral-200 p-3">
        <div className="flex flex-wrap items-center gap-1">
          {MINUTE_KIND_ORDER.map((k, i) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setKind(k)
                captureRef.current?.focus()
              }}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                kind === k
                  ? 'bg-neutral-900 text-white'
                  : 'border border-neutral-300 text-neutral-600 hover:bg-neutral-50'
              }`}
              aria-pressed={kind === k}
            >
              {MINUTE_KIND_LABEL[k]}
              <kbd
                className={kind === k ? 'border-neutral-700 bg-neutral-800 text-neutral-300' : ''}
              >
                Ctrl+{i + 1}
              </kbd>
            </button>
          ))}
          <span className="ml-1 text-xs text-neutral-400">{KIND_HINT[kind]}</span>
        </div>
        <input
          ref={captureRef}
          className="box-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // 変換確定のEnterで登録してしまわないようにする
            if (e.key === 'Enter' && !e.nativeEvent.isComposing && !e.ctrlKey && !e.metaKey) {
              e.preventDefault()
              void add()
              return
            }
            // 打っている途中のEscで画面ごと抜けない。まず入力を消すだけにする
            if (e.key === 'Escape' && text) {
              e.stopPropagation()
              setText('')
              return
            }
            // 入力欄から手を離さずに種別を変える
            if (e.ctrlKey && ['1', '2', '3'].includes(e.key)) {
              e.preventDefault()
              setKind(MINUTE_KIND_ORDER[Number(e.key) - 1])
            }
          }}
          placeholder="ここに放り込む(Enterで確定)"
          aria-label="議事録に追加"
          autoFocus
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {grouped.map(({ kind: k, blocks }) => (
        <section key={k} className="space-y-2">
          <h2 className="text-sm font-semibold text-neutral-900">
            {MINUTE_KIND_LABEL[k]}{' '}
            <span className="font-normal text-neutral-400">{blocks.length}</span>
          </h2>
          {blocks.length === 0 ? (
            <p className="px-1 text-sm text-neutral-400">
              {k === 'decision' ? 'まだ何も決まっていない。' : 'なし。'}
            </p>
          ) : (
            <ul className="divide-y divide-neutral-100 border-y border-neutral-100">
              {blocks.map((block) => (
                <li key={block.id} className="group flex items-start gap-2 py-1.5">
                  {k !== 'decision' && (
                    <input
                      type="checkbox"
                      checked={block.done === true}
                      onChange={() =>
                        void run(() =>
                          updateMinuteBlock(meeting.id, block.id, { done: !block.done }),
                        )
                      }
                      className="mt-1.5 size-4 shrink-0 accent-blue-600"
                      aria-label={k === 'todo' ? '完了' : '決着した'}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                      <div className={`min-w-0 flex-1 ${block.done ? 'text-neutral-400 line-through' : ''}`}>
                        <InlineText
                          value={block.text}
                          onCommit={(v) =>
                            void run(() => updateMinuteBlock(meeting.id, block.id, { text: v }))
                          }
                          className="text-sm"
                          ariaLabel="内容"
                        />
                      </div>
                      {block.offsetMs !== undefined && meeting.recording && (
                        <button
                          type="button"
                          onClick={() => void rec.seekTo(block.offsetMs!)}
                          className="mt-0.5 shrink-0 font-mono text-xs text-blue-600 hover:underline"
                          title={`この行を書いた${REWIND_SECONDS}秒前から再生`}
                        >
                          ▶ {formatOffset(block.offsetMs)}
                        </button>
                      )}
                    </div>

                    {k === 'todo' && (
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 px-1 text-xs text-neutral-500">
                        <span className="w-32">
                          <InlineText
                            value={block.assignee ?? ''}
                            onCommit={(v) =>
                              void run(() =>
                                updateMinuteBlock(meeting.id, block.id, {
                                  assignee: v || undefined,
                                }),
                              )
                            }
                            placeholder="担当"
                            className="text-xs"
                            ariaLabel="担当"
                          />
                        </span>
                        <input
                          type="date"
                          value={block.due ?? ''}
                          onChange={(e) =>
                            void run(() =>
                              updateMinuteBlock(meeting.id, block.id, {
                                due: e.target.value || undefined,
                              }),
                            )
                          }
                          className="rounded border border-neutral-200 px-1 py-0.5 text-xs"
                          aria-label="期限"
                        />
                        {block.taskId ? (
                          <Link
                            to={`/tasks/${block.taskId}`}
                            className="text-blue-600 hover:underline"
                          >
                            タスクを開く
                          </Link>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              void run(() => convertTodoToTask(meeting.id, block.id))
                            }
                            className="text-blue-600 hover:underline"
                            title="4つの箱に入れて、受け取りミスを防ぐ"
                          >
                            タスクにする
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => void run(() => removeMinuteBlock(meeting.id, block.id))}
                    className="shrink-0 text-xs text-neutral-300 opacity-0 group-hover:opacity-100 hover:text-red-600 focus:opacity-100"
                    aria-label="削除"
                  >
                    削除
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}

      <div className="flex items-center justify-between border-t border-neutral-100 pt-4">
        <span className="text-xs text-neutral-400">更新 {formatDateTime(meeting.updatedAt)}</span>
        {confirmDelete ? (
          <span className="flex items-center gap-2">
            <span className="text-xs text-neutral-600">この議事録を削除する?</span>
            <button
              type="button"
              className="btn-danger"
              onClick={() =>
                void run(() => removeMeeting(meeting.id)).then(
                  (ok) => ok && navigate('/meetings'),
                )
              }
            >
              削除する
            </button>
            <button type="button" className="btn-ghost" onClick={() => setConfirmDelete(false)}>
              やめる
            </button>
          </span>
        ) : (
          <button type="button" className="btn-danger" onClick={() => setConfirmDelete(true)}>
            削除
          </button>
        )}
      </div>
    </div>
  )
}
