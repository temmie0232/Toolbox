import { useCallback, useEffect, useState, type ClipboardEvent } from 'react'
import { deleteImage, readImage, saveImage } from '../storage'
import type { Memo } from '../types'
import { newId } from './id'

/**
 * メモに貼ったスクリーンショット。
 *
 * **絵そのものは data.json に入れない。**編集画面は打つたびに自動保存するので、
 * 画像を base64 で本文に混ぜると、1文字打つたびに数MBのJSONを書き直すことになる。
 * ファイルは録音と同じく別フォルダに置き、本文には印(`[画像:ファイル名]`)だけを埋める。
 *
 * **位置は本文の印が持つ。**textarea の中に絵は置けないので、
 * 「どの行に貼ったか」は本文の印で表し、絵は欄の下の帯に出す(`components/MemoImages.tsx`)。
 * 印を消せば帯からも消える = 本文が唯一の正。別に一覧を持たせると必ずずれる。
 */
const TOKEN = /\[画像:([0-9a-z]+\.(?:png|jpg|jpeg|gif|webp))\]/g

/** 貼り付けで受け取る形式。拡張子はここから決める(名前から MIME を戻せるようにするため) */
const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
}

const EXT_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
}

export function imageToken(fileName: string): string {
  return `[画像:${fileName}]`
}

/** 本文に出てくる順にファイル名を拾う。帯の並びもこの順 */
export function imageFilesIn(text: string | undefined): string[] {
  if (!text) return []
  return [...text.matchAll(TOKEN)].map((m) => m[1])
}

/** 一覧の1行要約のように、絵を出せない場所で印を短い言葉に置き換える */
export function stripImageTokens(text: string): string {
  return text.replace(TOKEN, '[画像]')
}

/** そのメモが使っている画像を全部集める。メモを消すとき、置き去りを出さないために使う */
export function memoImageFiles(memo: Memo): string[] {
  return [
    memo.fact,
    memo.interpretation,
    memo.action,
    memo.conclusion,
    ...(memo.reasons ?? []),
    memo.body,
  ].flatMap(imageFilesIn)
}

function mimeOf(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  return EXT_MIME[ext] ?? 'image/png'
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  // 一度に渡すと引数が多すぎて落ちるので刻む(録音の書き出しと同じ)
  const step = 0x8000
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step))
  }
  return btoa(binary)
}

/**
 * 貼り付けの中身から画像を取り出す。
 * 文字も一緒に来ているとき(Excelやブラウザからのコピー)は普通の貼り付けに任せる。
 * Win+Shift+S のスクリーンショットは画像だけなので、必ずこちらに来る。
 */
export function imageInClipboard(data: DataTransfer | null): File | null {
  if (!data) return null
  if (data.getData('text/plain').trim()) return null
  const inFiles = Array.from(data.files).find((file) => file.type in MIME_EXT)
  if (inFiles) return inFiles
  // files に載らない渡され方もあるので、items からも拾う
  for (const item of Array.from(data.items)) {
    if (item.kind !== 'file' || !(item.type in MIME_EXT)) continue
    const file = item.getAsFile()
    if (file) return file
  }
  return null
}

// ---- 表示用のURL ----
// 同じ画像を何度も読み直さないよう、1ファイルにつき1つだけ作って使い回す。
// 画面を離れても捨てない(戻ってくるたびに読み直すと、貼った直後の一覧が毎回ちらつく)

const urls = new Map<string, Promise<string>>()

function imageUrl(fileName: string): Promise<string> {
  const cached = urls.get(fileName)
  if (cached) return cached
  const load = readImage(fileName).then((bytes) => {
    const view = bytes instanceof ArrayBuffer ? bytes : new Uint8Array(bytes)
    return URL.createObjectURL(new Blob([view], { type: mimeOf(fileName) }))
  })
  // 失敗は覚えない。覚えると、一時的に読めなかっただけで二度と出なくなる
  load.catch(() => urls.delete(fileName))
  urls.set(fileName, load)
  return load
}

/** 画像1枚ぶんのURL。読めなければ理由を返す(ファイルだけ消えた場合など) */
export function useImageUrl(fileName: string): { url: string; error: string } {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    setUrl('')
    setError('')
    imageUrl(fileName).then(
      (value) => {
        if (alive) setUrl(value)
      },
      (e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : String(e))
      },
    )
    return () => {
      alive = false
    }
  }, [fileName])

  return { url, error }
}

/** メモを消すときに、貼ってあった画像も片付ける */
export async function deleteImages(fileNames: string[]): Promise<void> {
  await Promise.all(fileNames.map((name) => deleteImage(name).catch(() => undefined)))
  for (const name of fileNames) {
    const url = urls.get(name)
    urls.delete(name)
    void url?.then((value) => URL.revokeObjectURL(value)).catch(() => undefined)
  }
}

// ---- 貼り付け ----

/**
 * キャレットのある行に、印を1行として差し込む。
 *
 * 行の途中に埋めない。埋めると本文と混ざって、印だけを消したり動かしたりできなくなる。
 * 選んでいる文字があっても消さない(普通の貼り付けなら置き換わるが、
 * 画像を貼るつもりで数行が消えるほうが被害が大きい)。
 */
export function insertTokenLine(
  text: string,
  at: number,
  token: string,
): { text: string; caret: number } {
  const before = text.slice(0, at)
  const after = text.slice(at)
  const head = before === '' || before.endsWith('\n') ? '' : '\n'
  const tail = after.startsWith('\n') ? '' : '\n'
  return {
    text: `${before}${head}${token}${tail}${after}`,
    // 印の次の行。貼ってそのまま続きを書ける位置に置く
    caret: at + head.length + token.length + tail.length,
  }
}

/** 貼り付けられた画像をファイルに落とし、本文に埋める名前を返す */
async function storeImage(file: File): Promise<string> {
  const ext = MIME_EXT[file.type]
  if (!ext) throw new Error(`対応していない画像です(${file.type})`)
  const bytes = new Uint8Array(await file.arrayBuffer())
  // 名前は印として本文に残るので短くする。印が長いと本文が読みにくくなる
  const name = `${newId().replace(/-/g, '').slice(0, 12)}.${ext}`
  const saved = await saveImage(name, toBase64(bytes))
  // いま手元にあるバイト列でURLを作っておく。読み直さないぶん、貼った瞬間に絵が出る
  if (!urls.has(saved)) {
    urls.set(saved, Promise.resolve(URL.createObjectURL(new Blob([bytes], { type: file.type }))))
  }
  return saved
}

/**
 * 画像の貼り付け(Ctrl+V)。打っている欄のキャレット行にそのまま入る。
 *
 * 効くのは打っている欄、つまり入力モード。移動モードの欄は readOnly なので、
 * 貼り付けが届くかどうかはブラウザ任せになる(届いても本文は state 経由で変わるだけで、
 * どちらでも壊れない)。確実に貼りたいなら `i` で入力に入ってから。
 */
export function usePasteImage(
  onError: (message: string) => void,
  /** 貼ったファイル名。新規作成を取り消したときに片付けるため、呼び出し側で控えておく */
  onPasted?: (fileName: string) => void,
): (e: ClipboardEvent<HTMLTextAreaElement>, setValue: (text: string) => void) => void {
  return useCallback(
    (e: ClipboardEvent<HTMLTextAreaElement>, setValue: (text: string) => void) => {
      const file = imageInClipboard(e.clipboardData)
      if (!file) return
      e.preventDefault()
      const el = e.currentTarget
      void (async () => {
        try {
          const fileName = await storeImage(file)
          onPasted?.(fileName)
          // 保存を待つ間にも打てるので、位置と中身は「いま」の欄から取り直す
          const at = el.selectionEnd ?? el.value.length
          const next = insertTokenLine(el.value, at, imageToken(fileName))
          setValue(next.text)
          // 反映は次の描画。そのあとでキャレットを印の次の行へ置く
          requestAnimationFrame(() => {
            if (document.activeElement === el) el.setSelectionRange(next.caret, next.caret)
          })
        } catch (err) {
          onError(
            `画像を貼り付けられませんでした: ${err instanceof Error ? err.message : String(err)}`,
          )
        }
      })()
    },
    [onError, onPasted],
  )
}
