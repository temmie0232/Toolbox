import type { ReactNode } from 'react'

interface FieldProps {
  label: string
  hint?: string
  htmlFor?: string
  children: ReactNode
}

/** 「箱」1つ分。ラベル + 何を書けばいいかの一言 + 入力欄 */
export function Field({ label, hint, htmlFor, children }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-neutral-800">
        {label}
        {hint && <span className="ml-2 text-xs font-normal text-neutral-500">{hint}</span>}
      </label>
      {children}
    </div>
  )
}
