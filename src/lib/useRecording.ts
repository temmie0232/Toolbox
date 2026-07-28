import { invoke } from '@tauri-apps/api/core'
import { useCallback, useEffect, useRef, useState } from 'react'
import { registerFlush } from '../store'
import type { Recording } from '../types'

/**
 * 人は「聞いた後に」書く。記録時刻ぴったりに戻すと発言を過ぎているので、
 * この秒数だけ手前から再生する。
 */
export const REWIND_SECONDS = 15

/** 軽さ優先。ただし将来の文字起こし(16kHzモノラルが標準入力)に困らない下限は守る */
const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  channelCount: 1,
  sampleRate: 16000,
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
}
const AUDIO_BITS_PER_SECOND = 32_000
/** この間隔で書き出す。途中で落ちてもここまでは残る */
const TIMESLICE_MS = 5_000

function pickMimeType(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type
  }
  return ''
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  // 一度に渡すと引数が多すぎて落ちるので刻む
  const step = 0x8000
  for (let i = 0; i < buffer.length; i += step) {
    binary += String.fromCharCode(...buffer.subarray(i, i + step))
  }
  return btoa(binary)
}

export type RecordingStatus = 'idle' | 'recording' | 'stopping'

export interface UseRecording {
  status: RecordingStatus
  elapsedMs: number
  error: string
  /** 録音中なら、録音開始からの経過ミリ秒。録音していなければ undefined */
  offsetNow: () => number | undefined
  start: () => Promise<void>
  stop: () => Promise<void>
  /** 再生 */
  audioRef: React.RefObject<HTMLAudioElement | null>
  audioUrl: string | null
  loadingAudio: boolean
  seekTo: (offsetMs: number) => Promise<void>
}

export function useRecording(
  meetingId: string,
  recording: Recording | undefined,
  onFinished: (recording: Recording) => void,
): UseRecording {
  const [status, setStatus] = useState<RecordingStatus>('idle')
  const [elapsedMs, setElapsedMs] = useState(0)
  const [error, setError] = useState('')
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [loadingAudio, setLoadingAudio] = useState(false)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const startedAtRef = useRef<number>(0)
  const fileNameRef = useRef<string>('')
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  // 断片の書き込みは順番に並べる。並行させると音声の順序が壊れる
  const writeChainRef = useRef<Promise<unknown>>(Promise.resolve())

  const offsetNow = useCallback(
    () => (status === 'recording' ? Date.now() - startedAtRef.current : undefined),
    [status],
  )

  // 経過時間の表示
  useEffect(() => {
    if (status !== 'recording') return
    const timer = setInterval(() => setElapsedMs(Date.now() - startedAtRef.current), 500)
    return () => clearInterval(timer)
  }, [status])

  const startingRef = useRef(false)

  const start = useCallback(async () => {
    // awaitを挟むので、印は「マイクを取りに行く前」に立てる。
    // 立てるのが後だと、二度押しで録音機が2つ動いて同じファイルに書き込む
    if (recorderRef.current || startingRef.current) return
    startingRef.current = true
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS })
      const mimeType = pickMimeType()
      const recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
      })
      // 録り直しのたびに別ファイルにする。同じ名前に追記すると
      // 2つの録音が1本に繋がり、頭出しの位置が全部ずれる
      const fileName = `${meetingId}-${Date.now()}.webm`

      recorder.ondataavailable = (event) => {
        if (event.data.size === 0) return
        writeChainRef.current = writeChainRef.current
          .then(() => blobToBase64(event.data))
          .then((chunkBase64) => invoke('append_recording', { fileName, chunkBase64 }))
          .catch((e: unknown) =>
            setError(`録音を保存できませんでした: ${e instanceof Error ? e.message : String(e)}`),
          )
      }

      streamRef.current = stream
      recorderRef.current = recorder
      fileNameRef.current = fileName
      startedAtRef.current = Date.now()
      setElapsedMs(0)
      recorder.start(TIMESLICE_MS)
      setStatus('recording')
    } catch (e) {
      setError(
        `録音を開始できませんでした: ${e instanceof Error ? e.message : String(e)}(マイクの使用が許可されているか確認してください)`,
      )
    } finally {
      startingRef.current = false
    }
  }, [meetingId])

  // 画面を離れるときにも同じ後始末をしたいので、refに置いて参照を固定する
  const onFinishedRef = useRef(onFinished)
  onFinishedRef.current = onFinished

  const stop = useCallback(async () => {
    const recorder = recorderRef.current
    if (!recorder) return
    recorderRef.current = null
    setStatus('stopping')
    const durationMs = Date.now() - startedAtRef.current

    try {
      if (recorder.state !== 'inactive') {
        await new Promise<void>((resolve) => {
          recorder.onstop = () => resolve()
          recorder.stop()
        })
      }
    } catch {
      // 既に止まっていた場合。ここで諦めると保存されないので先へ進む
    }
    streamRef.current?.getTracks().forEach((track) => track.stop())
    // 最後の断片が書き終わるまで待つ
    await writeChainRef.current.catch(() => undefined)

    streamRef.current = null
    setStatus('idle')
    onFinishedRef.current({
      fileName: fileNameRef.current,
      startedAt: new Date(startedAtRef.current).toISOString(),
      durationMs,
      mimeType: recorder.mimeType || 'audio/webm',
    })
  }, [])

  // 画面を離れるときに録音が生きていたら、止めて「録音あり」を必ず記録する。
  // ここで記録し損ねると、音声だけがフォルダに残って辿れなくなる
  useEffect(() => {
    return () => {
      if (recorderRef.current) void stop()
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    }
  }, [stop])

  // ウィンドウを閉じる・トレイから終了するときにも録音を締める
  useEffect(() => registerFlush(async () => {
    if (recorderRef.current) await stop()
  }), [stop])

  // 読み込みが二重に走らないようにする。走らせると使われないURLが漏れ、
  // src の差し替えで再生位置も飛ぶ
  const loadingRef = useRef<Promise<void> | null>(null)

  /** 録音ファイルを読み込んで再生できる状態にする */
  const ensureAudio = useCallback(async (): Promise<HTMLAudioElement | null> => {
    if (!recording) return null
    if (loadingRef.current) await loadingRef.current
    if (!objectUrlRef.current) {
      setLoadingAudio(true)
      const load = (async () => {
        try {
          const bytes = await invoke<ArrayBuffer | number[]>('read_recording', {
            fileName: recording.fileName,
          })
          const blob = new Blob([bytes instanceof ArrayBuffer ? bytes : new Uint8Array(bytes)], {
            type: recording.mimeType,
          })
          const url = URL.createObjectURL(blob)
          objectUrlRef.current = url
          setAudioUrl(url)
        } catch (e) {
          setError(`録音を読み込めませんでした: ${e instanceof Error ? e.message : String(e)}`)
        } finally {
          setLoadingAudio(false)
        }
      })()
      loadingRef.current = load
      await load
      loadingRef.current = null
      if (!objectUrlRef.current) return null
    }
    return audioRef.current
  }, [recording])

  /**
   * 録音しながら書いたブロックの時刻へ飛ぶ。
   * 録りっぱなしのWebMは長さが入っていないことがあり、そのままでは頭出しできない。
   * 一度とんでもない位置へ飛ばして長さを確定させてから、目的の位置へ移す。
   */
  const seekTo = useCallback(
    async (offsetMs: number) => {
      const audio = await ensureAudio()
      if (!audio) return
      if (!Number.isFinite(audio.duration)) {
        await new Promise<void>((resolve) => {
          const onUpdate = () => {
            audio.removeEventListener('timeupdate', onUpdate)
            resolve()
          }
          audio.addEventListener('timeupdate', onUpdate)
          audio.currentTime = 1e101
          // 反応しない場合も先へ進む
          setTimeout(() => {
            audio.removeEventListener('timeupdate', onUpdate)
            resolve()
          }, 1500)
        })
      }
      audio.currentTime = Math.max(0, offsetMs / 1000 - REWIND_SECONDS)
      void audio.play()
    },
    [ensureAudio],
  )

  return {
    status,
    elapsedMs,
    error,
    offsetNow,
    start,
    stop,
    audioRef,
    audioUrl,
    loadingAudio,
    seekTo,
  }
}

export function formatOffset(ms: number): string {
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
