import { invoke } from '@tauri-apps/api/core'
import { useCallback, useEffect, useRef, useState } from 'react'
import { registerFlush } from '../store'
import type { Recording } from '../types'

/**
 * 人は「聞いた後に」書く。記録時刻ぴったりに戻すと発言を過ぎているので、
 * この秒数だけ手前から再生する。
 */
export const REWIND_SECONDS = 15

/** 軽さ優先。ただし将来の文字起こし(16kHz以上のモノラルが標準入力)に困らない下限は守る */
const MIC_CONSTRAINTS: MediaTrackConstraints = {
  channelCount: 1,
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

export type RecordingStatus = 'idle' | 'recording' | 'paused' | 'stopping'

export interface UseRecording {
  status: RecordingStatus
  /** 実際に録れている長さ。一時停止中は進まない */
  elapsedMs: number
  error: string
  /** システム音声(相手の声)を拾えているか */
  systemAudio: boolean
  /** マイク(自分の声)が入っているか */
  micOn: boolean
  toggleMic: () => void
  offsetNow: () => number | undefined
  start: () => Promise<void>
  pause: () => void
  resume: () => void
  /** 録音を確定して保存する */
  finish: () => Promise<void>
  /** 録り直し。いまの音声は捨てる */
  discard: () => Promise<void>
  audioRef: React.RefObject<HTMLAudioElement | null>
  audioUrl: string | null
  loadingAudio: boolean
  seekTo: (offsetMs: number) => Promise<void>
}

export function useRecording(
  meetingId: string,
  recording: Recording | undefined,
  onFinished: (recording: Recording) => void,
  onDiscarded: () => Promise<void>,
): UseRecording {
  const [status, setStatus] = useState<RecordingStatus>('idle')
  const [elapsedMs, setElapsedMs] = useState(0)
  const [error, setError] = useState('')
  const [systemAudio, setSystemAudio] = useState(false)
  const [micOn, setMicOn] = useState(true)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [loadingAudio, setLoadingAudio] = useState(false)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const startingRef = useRef(false)
  const streamsRef = useRef<MediaStream[]>([])
  const micTrackRef = useRef<MediaStreamTrack | null>(null)
  const contextRef = useRef<AudioContext | null>(null)
  const fileNameRef = useRef<string>('')
  const startedAtRef = useRef<number>(0)
  // 一時停止をまたいでも「実際に録れた長さ」で数える。
  // 壁時計で数えると、止めていた分だけ頭出しの位置がずれる
  const accumulatedRef = useRef(0)
  const segmentStartedAtRef = useRef(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  // 断片の書き込みは順番に並べる。並行させると音声の順序が壊れる
  const writeChainRef = useRef<Promise<unknown>>(Promise.resolve())

  const recordedMs = useCallback(
    () =>
      accumulatedRef.current +
      (recorderRef.current?.state === 'recording' ? Date.now() - segmentStartedAtRef.current : 0),
    [],
  )

  const offsetNow = useCallback(
    () => (recorderRef.current ? recordedMs() : undefined),
    [recordedMs],
  )

  // 経過時間の表示
  useEffect(() => {
    if (status !== 'recording') return
    const timer = setInterval(() => setElapsedMs(recordedMs()), 500)
    return () => clearInterval(timer)
  }, [status, recordedMs])

  /** 使った音源を全部閉じる */
  const releaseSources = useCallback(() => {
    streamsRef.current.forEach((stream) => stream.getTracks().forEach((track) => track.stop()))
    streamsRef.current = []
    micTrackRef.current = null
    void contextRef.current?.close().catch(() => undefined)
    contextRef.current = null
  }, [])

  const start = useCallback(async () => {
    // awaitを挟むので、印は「音源を取りに行く前」に立てる。
    // 立てるのが後だと、二度押しで録音機が2つ動いて同じファイルに書き込む
    if (recorderRef.current || startingRef.current) return
    startingRef.current = true
    setError('')

    const context = new AudioContext()
    const destination = context.createMediaStreamDestination()
    destination.channelCount = 1
    const streams: MediaStream[] = []
    let gotSystem = false
    let gotMic = false

    try {
      // システム音声。Web会議の相手の声はマイクからはまともに入らないので、こちらが主役
      try {
        const display = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        })
        // 映像は録らない。すぐ止める
        display.getVideoTracks().forEach((track) => track.stop())
        if (display.getAudioTracks().length > 0) {
          streams.push(display)
          context.createMediaStreamSource(display).connect(destination)
          gotSystem = true
        }
      } catch {
        // 選択をやめた場合もここに来る。マイクだけで続ける
      }

      // マイク。録音中でも切れるように、トラックを持っておく
      try {
        const mic = await navigator.mediaDevices.getUserMedia({ audio: MIC_CONSTRAINTS })
        streams.push(mic)
        context.createMediaStreamSource(mic).connect(destination)
        micTrackRef.current = mic.getAudioTracks()[0] ?? null
        if (micTrackRef.current) micTrackRef.current.enabled = micOn
        gotMic = true
      } catch {
        // マイクが使えなくても、システム音声だけで録れる
      }

      if (!gotSystem && !gotMic) {
        throw new Error('音源をひとつも取得できませんでした')
      }

      const mimeType = pickMimeType()
      const recorder = new MediaRecorder(destination.stream, {
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

      contextRef.current = context
      streamsRef.current = streams
      recorderRef.current = recorder
      fileNameRef.current = fileName
      startedAtRef.current = Date.now()
      accumulatedRef.current = 0
      segmentStartedAtRef.current = Date.now()
      setElapsedMs(0)
      setSystemAudio(gotSystem)
      if (!gotSystem) {
        setError('システム音声を取得できませんでした。マイクだけで録音します。')
      }
      recorder.start(TIMESLICE_MS)
      setStatus('recording')
    } catch (e) {
      streams.forEach((stream) => stream.getTracks().forEach((track) => track.stop()))
      void context.close().catch(() => undefined)
      setError(
        `録音を開始できませんでした: ${e instanceof Error ? e.message : String(e)}(共有の選択でシステム音声にチェックを入れてください)`,
      )
    } finally {
      startingRef.current = false
    }
  }, [meetingId, micOn])

  const pause = useCallback(() => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state !== 'recording') return
    accumulatedRef.current += Date.now() - segmentStartedAtRef.current
    recorder.pause()
    setElapsedMs(accumulatedRef.current)
    setStatus('paused')
  }, [])

  const resume = useCallback(() => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state !== 'paused') return
    segmentStartedAtRef.current = Date.now()
    recorder.resume()
    setStatus('recording')
  }, [])

  const toggleMic = useCallback(() => {
    setMicOn((on) => {
      const next = !on
      if (micTrackRef.current) micTrackRef.current.enabled = next
      return next
    })
  }, [])

  // 画面を離れるときにも同じ後始末をしたいので、refに置いて参照を固定する
  const onFinishedRef = useRef(onFinished)
  onFinishedRef.current = onFinished
  const onDiscardedRef = useRef(onDiscarded)
  onDiscardedRef.current = onDiscarded

  /** 録音機を止めて、書き残しを流し切る */
  const halt = useCallback(async (): Promise<MediaRecorder | null> => {
    const recorder = recorderRef.current
    if (!recorder) return null
    recorderRef.current = null
    accumulatedRef.current = recordedMs()
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
    releaseSources()
    await writeChainRef.current.catch(() => undefined)
    return recorder
  }, [recordedMs, releaseSources])

  const finish = useCallback(async () => {
    if (!recorderRef.current) return
    setStatus('stopping')
    const recorder = await halt()
    setStatus('idle')
    if (!recorder) return
    onFinishedRef.current({
      fileName: fileNameRef.current,
      startedAt: new Date(startedAtRef.current).toISOString(),
      durationMs: accumulatedRef.current,
      mimeType: recorder.mimeType || 'audio/webm',
    })
  }, [halt])

  /** 録り直し。いまの音声は消して、書いた行の時刻も外す */
  const discard = useCallback(async () => {
    setStatus('stopping')
    await halt()
    const fileName = fileNameRef.current || recording?.fileName
    if (fileName) {
      await invoke('delete_recording', { fileName }).catch(() => undefined)
    }
    fileNameRef.current = ''
    accumulatedRef.current = 0
    setElapsedMs(0)
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
      setAudioUrl(null)
    }
    await onDiscardedRef.current()
    setStatus('idle')
  }, [halt, recording?.fileName])

  // 画面を離れるときに録音が生きていたら、締めて「録音あり」を必ず記録する。
  // ここで記録し損ねると、音声だけがフォルダに残って辿れなくなる
  useEffect(() => {
    return () => {
      if (recorderRef.current) void finish()
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    }
  }, [finish])

  // ウィンドウを閉じる・トレイから終了するときにも録音を締める
  useEffect(
    () =>
      registerFlush(async () => {
        if (recorderRef.current) await finish()
      }),
    [finish],
  )

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
    systemAudio,
    micOn,
    toggleMic,
    offsetNow,
    start,
    pause,
    resume,
    finish,
    discard,
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
