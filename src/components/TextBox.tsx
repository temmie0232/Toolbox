import type { ComponentProps } from 'react'
import { useMode } from '../lib/mode'

/**
 * 入力欄。移動モードの間は readOnly になる。
 *
 * readOnly にするのが要点。単に keydown を preventDefault しても日本語入力は止まらず、
 * j や k を打った瞬間に変換が始まってしまう。読み取り専用の欄にはIMEが乗らない。
 *
 * 素の <input> を使うとその欄だけ移動モードで文字が入ってしまうので、
 * 文字を打つ欄はこれで書く。
 */
export function TextBox({ readOnly, ...rest }: ComponentProps<'input'>) {
  const mode = useMode()
  return <input {...rest} readOnly={readOnly || mode === 'normal'} />
}

export function TextArea({ readOnly, ...rest }: ComponentProps<'textarea'>) {
  const mode = useMode()
  return <textarea {...rest} readOnly={readOnly || mode === 'normal'} />
}
