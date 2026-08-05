import { useEffect, useMemo, useRef, useState } from 'react'
import { imageFilesIn, useImageUrl } from '../lib/memoImages'
import { useEscapeOwner } from '../lib/mode'

interface ImageStripProps {
  /** その欄の本文。中の印(`[画像:…]`)を見て、出てくる順に並べる */
  text: string
  onOpen: (fileName: string) => void
}

/**
 * 欄の下に出す画像の帯。
 *
 * textarea の中に絵は置けないので、本文は印を持ち、絵はここに出す。
 * 並びは本文の印の順で、番号もその順。本文の何行目の印がどれかを目で追えるようにするため。
 *
 * `data-secondary` を付けて j/k の列からは外す。1枚ごとに j を押させると
 * 行数に比例する操作になってしまう。Tab と 札(f) では届くので、行けなくなるものは無い。
 */
export function ImageStrip({ text, onOpen }: ImageStripProps) {
  const files = useMemo(() => imageFilesIn(text), [text])
  if (files.length === 0) return null
  return (
    <div data-secondary className="flex flex-wrap gap-2 pt-1">
      {files.map((fileName, i) => (
        <Thumb key={`${fileName}-${i}`} fileName={fileName} index={i} onOpen={onOpen} />
      ))}
    </div>
  )
}

interface ThumbProps {
  fileName: string
  index: number
  onOpen: (fileName: string) => void
}

function Thumb({ fileName, index, onOpen }: ThumbProps) {
  const { url, error } = useImageUrl(fileName)

  // ファイルだけ無くなった場合(バックアップから戻した後など)。
  // 黙って消すと本文の印だけが残って理由が分からなくなるので、ここで理由を出す
  if (error) {
    return (
      <span className="rounded-md border border-dashed border-neutral-300 px-2 py-1.5 text-xs text-neutral-500">
        {index + 1}: 画像が見つかりません({fileName})
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(fileName)}
      title={`拡大する(${index + 1}枚目)`}
      className="relative overflow-hidden rounded-md border border-neutral-200 transition-colors hover:border-blue-600"
    >
      {url ? (
        <img
          src={url}
          alt={`貼り付けた画像 ${index + 1}`}
          className="block max-h-28 max-w-48 object-contain"
        />
      ) : (
        <span className="block h-28 w-40 animate-pulse bg-neutral-100" />
      )}
      <span className="absolute top-0 left-0 rounded-br bg-black/50 px-1 font-mono text-[10px] text-white">
        {index + 1}
      </span>
    </button>
  )
}

interface ImageViewerProps {
  fileName: string
  onClose: () => void
}

/**
 * 拡大表示。押した画像を画面いっぱいに出す。
 *
 * 開いている間は Esc を自分のものにする(`useEscapeOwner`)。
 * 取らないと、入力を抜ける Esc や画面を出る Esc と食い合う。
 *
 * スクリーンショットは縮めると文字が読めないので、画像を押すと等倍に切り替える。
 */
export function ImageViewer({ fileName, onClose }: ImageViewerProps) {
  const { url, error } = useImageUrl(fileName)
  const [actualSize, setActualSize] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEscapeOwner(true, onClose)

  // 開いたら閉じるボタンへ、閉じたら元いた場所へフォーカスを戻す
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    return () => previous?.focus()
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-auto bg-black/75 p-6"
      onClick={onClose}
      // Tab が後ろの画面へ抜けないようにする。中にあるのは閉じるボタンだけ
      onKeyDown={(e) => {
        if (e.key !== 'Tab') return
        e.preventDefault()
        closeRef.current?.focus()
      }}
      role="presentation"
    >
      {error ? (
        <p className="rounded-md bg-white px-4 py-3 text-sm text-red-600">
          画像を読み込めませんでした: {error}
        </p>
      ) : (
        url && (
          <img
            src={url}
            alt="貼り付けた画像"
            className={
              actualSize ? 'max-w-none cursor-zoom-out' : 'max-h-full max-w-full cursor-zoom-in object-contain'
            }
            onClick={(e) => {
              e.stopPropagation()
              setActualSize((v) => !v)
            }}
          />
        )
      )}

      {/* 等倍にすると中身がはみ出してスクロールするので、操作は画面に貼り付けたままにする */}
      <button
        ref={closeRef}
        type="button"
        className="btn-ghost fixed top-3 right-3 bg-white"
        onClick={onClose}
      >
        閉じる <kbd>Esc</kbd>
      </button>
      <p className="pointer-events-none fixed bottom-3 left-1/2 -translate-x-1/2 text-xs text-white/70">
        画像を押すと{actualSize ? '全体表示' : '等倍'} / 外側を押すと閉じる
      </p>
    </div>
  )
}
