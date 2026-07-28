import { invoke } from '@tauri-apps/api/core'
import { useCallback, useEffect, useRef, useState } from 'react'
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

  const start = useCallback(async () => {
    if (recorderRef.current) return
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS })
      const mimeType = pickMimeType()
      const recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
      })
      const fileName = `${meetingId}.webm`

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
    }
  }, [meetingId])

  const stop = useCallback(async () => {
    const recorder = recorderRef.current
    if (!recorder) return
    setStatus('stopping')
    const durationMs = Date.now() - startedAtRef.current

    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve()
      recorder.stop()
    })
    streamRef.current?.getTracks().forEach((track) => track.stop())
    // 最後の断片が書き終わるまで待つ
    await writeChainRef.current.catch(() => undefined)

    recorderRef.current = null
    streamRef.current = null
    setStatus('idle')
    onFinished({
      fileName: fileNameRef.current,
      startedAt: new Date(startedAtRef.current).toISOString(),
      durationMs,
      mimeType: recorder.mimeType || 'audio/webm',
    })
  }, [onFinished])

  // 画面を離れるときに録音が生きていたら、止めて保存する
  useEffect(() => {
    return () => {
      if (recorderRef.current) {
        recorderRef.current.stop()
        streamRef.current?.getTracks().forEach((track) => track.stop())
      }
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    }
  }, [])

  /** 録音ファイルを読み込んで再生できる状態にする */
  const ensureAudio = useCallback(async (): Promise<HTMLAudioElement | null> => {
    if (!recording) return null
    if (!objectUrlRef.current) {
      setLoadingAudio(true)
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
        return null
      } finally {
        setLoadingAudio(false)
      }
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
