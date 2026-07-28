import { fromToday, nextFriday, today } from '../lib/date'

interface DeadlinePickProps {
  value: string
  onChange: (value: string) => void
}

/** 期限のワンクリック指定。日付ピッカーを触らずに済ませるためのチップ */
export function DeadlinePick({ value, onChange }: DeadlinePickProps) {
  const chips = [
    { label: '今日', date: today() },
    { label: '明日', date: fromToday(1) },
    { label: '金曜', date: nextFriday() },
    { label: '来週', date: fromToday(7) },
  ]

  return (
    <div className="flex items-center gap-1">
      {chips.map((chip) => (
        <button
          key={chip.label}
          type="button"
          onClick={() => onChange(chip.date)}
          className={`rounded px-2 py-0.5 text-xs transition-colors ${
            value === chip.date
              ? 'bg-neutral-900 text-white'
              : 'border border-neutral-200 text-neutral-500 hover:bg-neutral-50'
          }`}
        >
          {chip.label}
        </button>
      ))}
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="px-1.5 py-0.5 text-xs text-neutral-400 hover:text-neutral-700"
        >
          クリア
        </button>
      )}
    </div>
  )
}
