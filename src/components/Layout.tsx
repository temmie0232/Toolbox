import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useGuiMode } from '../lib/guiMode'
import { useMode } from '../lib/mode'
import { ShortcutSuspendContext, useShortcuts } from '../lib/useShortcuts'
import { useSpotNav } from '../lib/useSpotNav'
import { hideWindow, quitApp, setAlwaysOnTop } from '../storage'
import {
  createMeeting,
  flushAllEdits,
  getSaveError,
  hasBlockingDraft,
  retrySave,
  useStore,
} from '../store'
import { HintOverlay } from './HintOverlay'
import { NavTabs, type NavItem } from './NavTabs'
import { QuickJump } from './QuickJump'
import { ShortcutHelp } from './ShortcutHelp'

const PIN_KEY = 'tool:pinned'

/**
 * 開発ビルドと本番を並べて常駐させるので、画面の中でも見分けが付くようにする。
 * ウィンドウに枠が無く題名が出ないため、掴む取っ手の色と左下の表示で示す。
 * Alt+Tab・タスクバー・トレイの名前は Rust 側(`APP_TITLE`)。
 */
const IS_DEV = import.meta.env.DEV

/**
 * 画面切替(小文字=一覧 / 大文字=新規)。ショートカットのマップと GUIモードのタブ、
 * 両方をこの1つの配列から組み立てる(二重管理を避ける)。
 */
const NAV_ITEMS: NavItem[] = [
  { key: 't', upperKey: 'T', path: '/', newPath: '/tasks/new', label: 'タスク', match: (p) => p === '/' || p.startsWith('/tasks') },
  { key: 'm', upperKey: 'M', path: '/memos', newPath: '/memos/new', label: 'メモ', match: (p) => p.startsWith('/memos') },
  { key: 'r', upperKey: 'R', path: '/meetings', newPath: '/meetings/new', label: '議事録', match: (p) => p.startsWith('/meetings') },
  // 概念に専用の新規画面は無い。一覧の放り込み欄がその代わりなので、大文字はそこへ直行する
  { key: 'y', upperKey: 'Y', path: '/concepts', newPath: '/concepts?new=1', label: '概念', match: (p) => p.startsWith('/concepts') },
]

export function Layout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { saveError } = useStore()
  const gui = useGuiMode()
  const [helpOpen, setHelpOpen] = useState(false)
  // 札(f / Shift+F)。activate=false は「押さずにそこへ移るだけ」
  const [hint, setHint] = useState<{ activate: boolean } | null>(null)
  const [jumpOpen, setJumpOpen] = useState(false)
  const mode = useMode()

  // 一時的な画面が出ている間は、下の画面のキーを全部止める
  const overlay = hint !== null || jumpOpen

  /** 書きかけを流し切ってから隠す。ウィンドウを閉じる操作と GUIモードの✕ボタンの両方から呼ぶ */
  const hideNow = useCallback(async () => {
    await flushAllEdits()
    // 保存できていないなら隠さない。バナーに気づかないまま放置されるのを防ぐ
    if (!getSaveError()) await hideWindow()
  }, [])

  /**
   * 常駐アプリなので、閉じる操作(Alt+F4・タスクバー)では終了せずに隠す。
   * 隠す前に書きかけの自動保存を流し切る。
   */
  useEffect(() => {
    const win = getCurrentWindow()
    const unlisten = win.onCloseRequested(async (event) => {
      event.preventDefault()
      await hideNow()
    })
    return () => {
      void unlisten.then((f) => f())
    }
  }, [hideNow])

  /** トレイの「終了」。保存を済ませてからプロセスを落とす */
  useEffect(() => {
    const unlisten = listen('app-quit', async () => {
      await flushAllEdits()
      if (getSaveError()) {
        // 保存に失敗している間は終了させない(未保存のまま消えるため)
        await getCurrentWindow().show()
        return
      }
      await quitApp()
    })
    return () => {
      void unlisten.then((f) => f())
    }
  }, [])

  /** 前回、前面固定したまま終了していたら起動時に戻す(切り替えはCtrl+Alt+P) */
  useEffect(() => {
    if (localStorage.getItem(PIN_KEY) === '1') void setAlwaysOnTop(true)
    const unlisten = listen<boolean>('pin-changed', (event) => {
      localStorage.setItem(PIN_KEY, event.payload ? '1' : '0')
    })
    return () => {
      void unlisten.then((f) => f())
    }
  }, [])

  /** Ctrl+M で最小化(ボタンを置かない代わり) */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'm' && e.ctrlKey && !e.altKey && !e.shiftKey) {
        e.preventDefault()
        void getCurrentWindow().minimize()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  /**
   * 画面切替。新規作成フォームに書きかけがあるとき・録音中は飛ばない。
   * 黙って無反応にすると「キーが効かない」と区別が付かないので、理由を出す
   */
  const [blocked, setBlocked] = useState(false)
  const go = useCallback(
    (path: string) => {
      if (hasBlockingDraft()) {
        setBlocked(true)
        return
      }
      setHelpOpen(false)
      navigate(path)
    },
    [navigate],
  )

  /**
   * リンクは React Router が自前で click を拾うので go() を通らない。
   * 録音中に議事録の「タスクを開く」を踏むと、そのまま画面が変わって録音が切れていた。
   *
   * capture で聞いて React Router のハンドラより先に潰す。
   * ここを choke point にしておけば、マウス・Enter・札(f) のどれで押しても同じく止まる
   * (Enterと札は本物の click を投げているため)。
   */
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented) return
      if (!(e.target instanceof Element)) return
      if (!e.target.closest('a[href]')) return
      if (!hasBlockingDraft()) return
      e.preventDefault()
      e.stopPropagation()
      setBlocked(true)
    }
    window.addEventListener('click', onClick, true)
    return () => window.removeEventListener('click', onClick, true)
  }, [])

  // 設定から戻る先を覚えておく。行って帰ってこられるようにするため
  const backPathRef = useRef('/')
  useEffect(() => {
    setBlocked(false)
    if (location.pathname !== '/settings') {
      backPathRef.current = location.pathname + location.search
    }
  }, [location])

  /** 設定と行き来する。上のバーのダブルクリックと , の両方から呼ぶ */
  const toggleSettings = useCallback(() => {
    if (location.pathname === '/settings') go(backPathRef.current || '/')
    else go('/settings')
  }, [location.pathname, go])

  const onSettings = location.pathname === '/settings'

  const shortcuts = useMemo(() => {
    const map: Record<string, () => void> = {}
    // 小文字が一覧、大文字が新規。4種類とも同じ規則にする(NAV_ITEMS はタブとも共有)
    for (const item of NAV_ITEMS) {
      map[item.key] = () => go(item.path)
      map[item.upperKey] = () => go(item.newPath)
    }
    Object.assign(map, {
      ',': toggleSettings,
      '?': () => setHelpOpen(true),
      // 札を出して一撃で飛ぶ。f は押す、Shift+F はそこへ移るだけ。
      // ヘルプの上に札を出すと、後ろの画面を指したまま重なって読めなくなる
      f: () => !helpOpen && setHint({ activate: true }),
      F: () => !helpOpen && setHint({ activate: false }),
      // どこからでも、名前の数文字で目的のものへ
      '/': () => !helpOpen && setJumpOpen(true),
      Escape: () => {
        if (helpOpen) setHelpOpen(false)
        // 設定は自前のEscを持たないので、ここで元の画面へ返す
        else if (onSettings) toggleSettings()
      },
    })
    if (onSettings) map.h = toggleSettings
    return map
  }, [go, toggleSettings, onSettings, helpOpen])
  useShortcuts(shortcuts, !overlay)

  /** 来た道を戻る・進む。Ctrl+O/Ctrl+I とGUIモードの矢印ボタンの両方から呼ぶ */
  const historyGo = useCallback(
    (delta: number) => {
      if (hasBlockingDraft()) {
        setBlocked(true)
        return
      }
      navigate(delta)
    },
    [navigate],
  )

  /** Ctrl+O / Ctrl+I で来た道を戻る・進む。開き直しの手間を無くす */
  useEffect(() => {
    // 札や絞り込みが出ている間は動かさない。裏で画面が変わると札が別物を指す
    if (overlay) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey || e.shiftKey || e.metaKey) return
      const key = e.key.toLowerCase()
      if (key !== 'o' && key !== 'i') return
      e.preventDefault()
      historyGo(key === 'o' ? -1 : 1)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [overlay, historyGo])

  /**
   * Ctrl+E をどこからでも。会議名なしの議事録をその場で作り、着いた先ですぐ録音を始める。
   * 「会議が始まってから議事録を作る」手間で頭を録り逃すのが一番痛いので、
   * 名前を聞く画面(/meetings/new)ごと飛ばす。名前は後から詳細画面で足せる(自動保存)。
   *
   * 議事録の詳細だけは除く。あちらが自分の Ctrl+E(一時停止・再開)を持っていて、
   * Layout と画面のリスナーは両方発火するため、ここで避けないと二重に効く
   */
  const onMeetingDetail = /^\/meetings\/(?!new$)[^/]+$/.test(location.pathname)
  const startingMeetingRef = useRef(false)
  useEffect(() => {
    if (overlay || onMeetingDetail) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey || e.shiftKey || e.metaKey) return
      if (e.key.toLowerCase() !== 'e') return
      e.preventDefault()
      // 書きかけの新規作成を黙って捨てない。他の画面切替キーと同じ扱い
      if (hasBlockingDraft()) {
        setBlocked(true)
        return
      }
      // 連打で空の議事録が積み上がらないようにする
      if (startingMeetingRef.current) return
      startingMeetingRef.current = true
      void createMeeting({ title: '', participants: '' })
        .then((meeting) => {
          setHelpOpen(false)
          // 着いた先で録音を始めさせる。ここで start は呼べない(録音機は詳細画面が持つ)
          navigate(`/meetings/${meeting.id}`, { state: { autoRecord: true } })
        })
        .catch(() => undefined)
        .finally(() => {
          startingMeetingRef.current = false
        })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [overlay, onMeetingDetail, navigate])

  /**
   * j/k で画面の押せるものを一列に回る。全画面で共通なので、ここで1回だけ持つ。
   * ヘルプや札が出ている間は止める(後ろの画面のフォーカスが動いてしまうため)
   */
  const rootRef = useRef<HTMLDivElement>(null)
  const { nav, count } = useSpotNav(rootRef, location.pathname)
  useShortcuts(nav, !helpOpen && !overlay)

  return (
    <div ref={rootRef} className="min-h-screen bg-white">
      {/*
        ウィンドウを動かすための取っ手。この灰色の横棒を掴むと移動できる。
        スクロールしても常に上に残るよう固定する。
        data-tauri-drag-region は使わない。あれはダブルクリックが最大化に
        固定されていて、こちらの用途(設定への行き来)に差し替えられないため
      */}
      <div className="sticky top-0 z-20 bg-white pt-2 pb-1 select-none">
        <div className="flex justify-center">
          <div
            className="cursor-grab px-6 py-1.5 active:cursor-grabbing"
            title={
              IS_DEV
                ? '開発ビルド — 掴むと移動 / ダブルクリックで設定とショートカット'
                : '掴むと移動 / ダブルクリックで設定とショートカット'
            }
            onMouseDown={(e) => {
              if (e.button !== 0) return
              // 2回目の押下はドラッグを始めない(そのままダブルクリックとして扱う)
              if (e.detail >= 2) return
              void getCurrentWindow().startDragging()
            }}
            onDoubleClick={toggleSettings}
          >
            {/* 開発版は取っ手を琥珀にする。一目で本番と区別が付く唯一の常設パーツ */}
            <div
              className={`pointer-events-none h-1 w-10 rounded-full ${
                IS_DEV ? 'bg-amber-400' : 'bg-neutral-300'
              }`}
            />
          </div>
        </div>
        {gui && (
          <NavTabs
            items={NAV_ITEMS}
            pathname={location.pathname}
            go={go}
            onSettings={toggleSettings}
            settingsActive={onSettings}
            onHelp={() => setHelpOpen(true)}
            onBack={() => historyGo(-1)}
            onForward={() => historyGo(1)}
            onMinimize={() => void getCurrentWindow().minimize()}
            disabled={overlay}
          />
        )}
      </div>

      {saveError && (
        <div className="flex items-center justify-between gap-4 border-y border-red-200 bg-red-50 px-6 py-2">
          <span className="text-sm text-red-700">
            保存に失敗しています: {saveError} —
            入力はメモリ上に残っています。再試行するか、バックアップを書き出してください。
          </span>
          <button type="button" className="btn-danger shrink-0" onClick={() => void retrySave()}>
            再試行
          </button>
        </div>
      )}

      {blocked && (
        <div className="border-y border-amber-200 bg-amber-50 px-6 py-2 text-sm text-amber-800">
          書きかけがあるので移動していません。<kbd>Esc</kbd> で取消、<kbd>Ctrl</kbd>{' '}
          <kbd>Enter</kbd> で保存(録音中なら <kbd>Ctrl</kbd> <kbd>Shift</kbd> <kbd>E</kbd>{' '}
          で終える)。
        </div>
      )}

      <main className="mx-auto max-w-3xl px-6 pt-2 pb-6">
        {/* ヘルプや一時的な画面が出ている間は各画面のショートカット(特にEsc)を止める */}
        <ShortcutSuspendContext value={helpOpen || overlay}>
          <Outlet />
        </ShortcutSuspendContext>
      </main>

      {/*
        いまどちらのモードか。モードがあるのに見えないと、
        打てないのが故障なのか仕様なのか分からなくなる。
        打ちかけの回数(3j の 3)もここに出す
      */}
      <div className="pointer-events-none fixed bottom-1 left-2 z-30 flex gap-2 font-mono text-[11px] select-none">
        {IS_DEV && <span className="font-bold text-amber-600">開発</span>}
        {mode === 'insert' ? (
          <span className="text-blue-600">-- 入力 --</span>
        ) : (
          <span className="text-neutral-300">-- 移動 --</span>
        )}
        {count > 0 && <span className="text-neutral-500">{count}</span>}
      </div>

      {helpOpen && <ShortcutHelp onClose={() => setHelpOpen(false)} />}
      {hint && (
        <HintOverlay rootRef={rootRef} activate={hint.activate} onDone={() => setHint(null)} />
      )}
      {jumpOpen && <QuickJump onPick={go} onClose={() => setJumpOpen(false)} />}
    </div>
  )
}
