import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { InlineText } from '../components/InlineText'
import { TextBox } from '../components/TextBox'
import { formatDateTime } from '../lib/date'
import { useInitialMode, useModeActions } from '../lib/mode'
import { REWIND_SECONDS, formatOffset, useRecording } from '../lib/useRecording'
import { useNumberShortcuts, useShortcuts } from '../lib/useShortcuts'
import {
  addMinuteBlock,
  clearMeetingRecording,
  convertTodoToTask,
  registerDraftGuard,
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

/**
 * 録音の操作ボタン。狭い画面でも崩れないよう小さく揃える。
 * ショートカットはツールチップに逃がす(ボタンに並べると横幅を食って折り返しが汚くなる)
 */
function RecButton({
  children,
  onClick,
  title,
  primary,
  disabled,
}: {
  children: React.ReactNode
  onClick: () => void
  title?: string
  primary?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        primary
          ? 'bg-blue-600 text-white hover:bg-blue-700'
          : 'border border-neutral-300 text-neutral-700 hover:bg-neutral-50'
      }`}
    >
      {children}
    </button>
  )
}

/** 音源が入っているかの表示。マイクだけは押して切り替えられる */
function SourceState({
  label,
  on,
  onClick,
  title,
}: {
  label: string
  on: boolean
  onClick?: () => void
  title?: string
}) {
  const body = (
    <>
      <span className={`size-1.5 rounded-full ${on ? 'bg-emerald-500' : 'bg-neutral-300'}`} />
      {label}
    </>
  )
  const className = `inline-flex items-center gap-1.5 text-xs ${on ? 'text-neutral-700' : 'text-neutral-400'}`
  if (!onClick) return <span className={className}>{body}</span>
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={on}
      className={`${className} rounded px-1 py-0.5 hover:bg-neutral-100`}
    >
      {body}
    </button>
  )
}

/** 録り直し。押し間違いで音声が消えないよう一段挟む */
function RedoControl({
  confirming,
  question,
  onAsk,
  onCancel,
  onConfirm,
}: {
  confirming: boolean
  question: string
  onAsk: () => void
  onCancel: () => void
  onConfirm: () => void
}) {
  if (!confirming) {
    return (
      <button
        type="button"
        data-secondary
        onClick={onAsk}
        title="録音を消して、行に記録した時刻も外す"
        className="rounded-md px-2 py-1 text-xs text-neutral-400 hover:bg-red-50 hover:text-red-700"
      >
        やり直す
      </button>
    )
  }
  return (
    <span data-secondary className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-neutral-600">{question}</span>
      <button
        type="button"
        onClick={onConfirm}
        className="rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
      >
        消す
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
      >
        やめる
      </button>
    </span>
  )
}

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
  const { enterInsert } = useModeActions()
  // 会議中に開く画面。開いた瞬間から放り込めるようにする
  useInitialMode('insert')
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
  const onRecordingDiscarded = useCallback(
    () => clearMeetingRecording(meeting.id),
    [meeting.id],
  )
  const rec = useRecording(
    meeting.id,
    meeting.recording,
    onRecordingFinished,
    onRecordingDiscarded,
  )
  const [confirmRedo, setConfirmRedo] = useState(false)

  const add = async () => {
    const value = text.trim()
    if (!value) return
    // 録音中なら、書いた瞬間の位置を覚えておく。あとでその前後を聞き返せる
    const offsetMs = rec.offsetNow()
    // 書き込みが通ってから消す。失敗したら打ち直しにならない
    const ok = await run(() => addMinuteBlock(meeting.id, { kind, text: value, offsetMs }))
    if (ok) setText('')
  }

  /**
   * 入力欄に手を置いたまま録音を操作できるようにする。
   * Ctrl+E: 開始 / 一時停止・再開、Ctrl+Shift+E: 確定、Ctrl+Shift+M: マイクの入切
   */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey) return
      const key = e.key.toLowerCase()
      if (key === 'e' && !e.shiftKey) {
        e.preventDefault()
        if (rec.status === 'recording') rec.pause()
        else if (rec.status === 'paused') rec.resume()
        else if (rec.status === 'idle' && !meeting.recording) void rec.start()
      } else if (key === 'e' && e.shiftKey) {
        e.preventDefault()
        if (rec.status === 'recording' || rec.status === 'paused') void rec.finish()
      } else if (key === 'm' && e.shiftKey) {
        e.preventDefault()
        rec.toggleMic()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [rec, meeting.recording])

  // 録音中は画面を離れさせない。離れると録音が切れて、
  // 録り直しになった分は元の音声と繋がらなくなる
  const recordingRef = useRef(false)
  recordingRef.current = rec.status === 'recording'
  useEffect(() => registerDraftGuard(() => recordingRef.current), [])

  const leave = useCallback(() => {
    if (recordingRef.current) {
      setError('録音中です。Ctrl+E で停止してから移動してください。')
      return
    }
    navigate('/meetings')
  }, [navigate])

  // 打ちかけの行を Esc で消さずに抱えたまま画面を出ないようにする。
  // 入力中の Esc は入力モードを抜けるだけなので、ここへ来るのは移動モードのEscだけ
  const textRef = useRef('')
  textRef.current = text

  const shortcuts = useMemo(
    () => ({
      Escape: () => {
        if (textRef.current) setText('')
        else leave()
      },
      h: leave,
      a: () => enterInsert(captureRef.current),
    }),
    [leave, enterInsert],
  )
  useShortcuts(shortcuts)

  // Ctrl+1〜3 で種別切替。入力欄から手を離さずに切り替えられる
  const kindHandlers = useMemo(() => MINUTE_KIND_ORDER.map((k) => () => setKind(k)), [])
  useNumberShortcuts(kindHandlers)

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
      <div className="space-y-2 rounded-lg border border-neutral-200 px-3 py-2">
        {rec.status === 'recording' || rec.status === 'paused' ? (
          <>
            {/* 上段は状態だけ。押せるのはマイクの入切のみ(Ctrl+Shift+M) */}
            <div data-secondary className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span
                className={`flex items-center gap-1.5 text-sm font-medium ${
                  rec.status === 'recording' ? 'text-red-600' : 'text-neutral-500'
                }`}
              >
                <span
                  className={`size-2 rounded-full ${
                    rec.status === 'recording' ? 'animate-pulse bg-red-600' : 'bg-neutral-400'
                  }`}
                />
                {rec.status === 'recording' ? '録音中' : '一時停止'}
                <span className="font-mono tabular-nums">{formatOffset(rec.elapsedMs)}</span>
              </span>
              <SourceState label="システム" on={rec.systemAudio} />
              {/* マイクは録音中でも切れる。自分の声を入れたくない場面があるため */}
              <SourceState
                label="マイク"
                on={rec.micOn}
                onClick={rec.toggleMic}
                title="マイクの入切(Ctrl+Shift+M)"
              />
            </div>

            {/* 下段は操作。Ctrl+E / Ctrl+Shift+E で足りるので j/k の列からは外す */}
            <div data-secondary className="flex flex-wrap items-center gap-2">
              {rec.status === 'recording' ? (
                <RecButton onClick={rec.pause} title="Ctrl+E">
                  一時停止
                </RecButton>
              ) : (
                <RecButton onClick={rec.resume} title="Ctrl+E">
                  再開
                </RecButton>
              )}
              <RecButton onClick={() => void rec.finish()} title="Ctrl+Shift+E" primary>
                終える
              </RecButton>
              <span className="flex-1" />
              <RedoControl
                confirming={confirmRedo}
                question="ここまでの音声を捨てる?"
                onAsk={() => setConfirmRedo(true)}
                onCancel={() => setConfirmRedo(false)}
                onConfirm={() => {
                  setConfirmRedo(false)
                  void rec.discard()
                }}
              />
            </div>
          </>
        ) : meeting.recording ? (
          <>
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-xs text-neutral-500">
                録音{' '}
                {meeting.recording.durationMs ? formatOffset(meeting.recording.durationMs) : ''}
              </span>
              <audio
                ref={rec.audioRef}
                src={rec.audioUrl ?? undefined}
                controls
                preload="metadata"
                className="h-8 min-w-0 flex-1"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {!rec.audioUrl && (
                <RecButton onClick={() => void rec.seekTo(0)} disabled={rec.loadingAudio}>
                  {rec.loadingAudio ? '読み込み中…' : '再生の準備'}
                </RecButton>
              )}
              <span className="flex-1" />
              <RedoControl
                confirming={confirmRedo}
                question="録音を消して録り直す?"
                onAsk={() => setConfirmRedo(true)}
                onCancel={() => setConfirmRedo(false)}
                onConfirm={() => {
                  setConfirmRedo(false)
                  void rec.discard()
                }}
              />
            </div>
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <RecButton
              onClick={() => void rec.start()}
              disabled={rec.status === 'stopping'}
              title="Ctrl+E"
            >
              録音を開始
            </RecButton>
            <span className="text-xs text-neutral-400">
              システム音声を録る。録音中に書いた行から、その時点を聞き返せる
            </span>
          </div>
        )}
      </div>

      {rec.error && <p className="text-sm text-red-600">{rec.error}</p>}

      {/* 入力口はひとつ。種別を切り替えながら流し込む */}
      <div className="space-y-2 rounded-lg border border-neutral-200 p-3">
        {/* 種別は Ctrl+1〜3 で足りるので、j/k の列からは外す */}
        <div data-secondary className="flex flex-wrap items-center gap-1">
          {MINUTE_KIND_ORDER.map((k, i) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setKind(k)
                enterInsert(captureRef.current)
              }}
              title={`${MINUTE_KIND_LABEL[k]}に切り替え(Ctrl+${i + 1})`}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                kind === k
                  ? 'bg-neutral-900 text-white'
                  : 'border border-neutral-300 text-neutral-600 hover:bg-neutral-50'
              }`}
              aria-pressed={kind === k}
            >
              {MINUTE_KIND_LABEL[k]}
            </button>
          ))}
          <span className="ml-1 text-xs text-neutral-400">{KIND_HINT[kind]}</span>
        </div>
        <TextBox
          ref={captureRef}
          className="box-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // 変換確定のEnterで登録してしまわないようにする
            if (e.key === 'Enter' && !e.nativeEvent.isComposing && !e.ctrlKey && !e.metaKey) {
              e.preventDefault()
              void add()
            }
            // Esc は入力モードを抜けるだけ(画面は動かない)。種別の切替は画面全体で拾う
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
                          data-secondary
                          onClick={() => void rec.seekTo(block.offsetMs!)}
                          className="mt-0.5 shrink-0 font-mono text-xs text-blue-600 hover:underline"
                          title={
                            REWIND_SECONDS > 0
                              ? `この行を書いた${REWIND_SECONDS}秒前から再生`
                              : 'この行を書いた時点から再生'
                          }
                        >
                          ▶ {formatOffset(block.offsetMs)}
                        </button>
                      )}
                    </div>

                    {/* 担当・期限・タスク化は行の付属品。札(f)から直接触る */}
                    {k === 'todo' && (
                      <div
                        data-secondary
                        className="mt-0.5 flex flex-wrap items-center gap-2 px-1 text-xs text-neutral-500"
                      >
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
                        <TextBox
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
                    data-secondary
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
