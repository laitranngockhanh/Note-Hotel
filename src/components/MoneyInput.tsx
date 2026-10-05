import { useLayoutEffect, useRef } from 'react'
import { money } from '../lib/format'
import { input } from './ui'

interface Props {
  value: number
  onChange: (value: number) => void
  ariaLabel?: string
  // Chỉ xem: dùng khi người đang thao tác không có quyền sửa số tiền này.
  readOnly?: boolean
}

// Số tiền lớn nhất nhập được là 12 chữ số, quá đủ cho tiền phòng tính bằng đồng.
const MAX_DIGITS = 12
const digitsIn = (text: string) => text.replace(/\D/g, '')

// Ô nhập tiền: gõ tới đâu tự chấm phần nghìn tới đó (3.000.000) và có chữ "đ" ở cuối, để
// không phải đếm số 0.
export default function MoneyInput({ value, onChange, ariaLabel, readOnly }: Props) {
  const ref = useRef<HTMLInputElement>(null)
  // Số chữ số nằm sau con trỏ lúc gõ. Dấu chấm thêm vào làm con trỏ nhảy về cuối, nên sau
  // khi vẽ lại phải đặt con trỏ về đúng chỗ, tính theo chữ số chứ không theo ký tự.
  const digitsAfterCaret = useRef<number | null>(null)
  const shown = value ? money(value) : ''

  useLayoutEffect(() => {
    const element = ref.current
    const after = digitsAfterCaret.current
    digitsAfterCaret.current = null
    if (!element || after === null || document.activeElement !== element) return
    let position = shown.length
    for (let seen = 0; position > 0 && seen < after; position -= 1) {
      if (/\d/.test(shown[position - 1])) seen += 1
    }
    element.setSelectionRange(position, position)
  })

  return (
    <span className="relative block w-full">
      <input
        ref={ref}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        aria-label={ariaLabel}
        readOnly={readOnly}
        className={`${input} pr-7 ${readOnly ? 'bg-slate-100! text-slate-500!' : ''}`}
        value={shown}
        onChange={(event) => {
          const { value: text, selectionStart } = event.target
          digitsAfterCaret.current = digitsIn(text.slice(selectionStart ?? text.length)).length
          onChange(Number(digitsIn(text).slice(0, MAX_DIGITS)) || 0)
        }}
      />
      <span aria-hidden className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-slate-400">
        đ
      </span>
    </span>
  )
}
