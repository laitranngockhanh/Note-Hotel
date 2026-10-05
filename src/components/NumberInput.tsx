import { useState } from 'react'
import { input } from './ui'

interface Props {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  ariaLabel?: string
}

// Ô nhập số nguyên nhỏ (số người, số ngày, giờ, phần trăm). Trong lúc gõ thì giữ đúng chữ
// người dùng đang gõ, kể cả khi ô đang trống, để xóa số cũ rồi gõ số mới được; giá trị chỉ
// bị ép vào khoảng min–max ở phía dữ liệu, và ô hiện lại số đã ép khi rời khỏi ô.
export default function NumberInput({ value, onChange, min = 0, max = 9999, ariaLabel }: Props) {
  // null là không đang gõ: ô hiện giá trị thật.
  const [text, setText] = useState<string | null>(null)

  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      aria-label={ariaLabel}
      className={input}
      value={text ?? String(value)}
      onChange={(event) => {
        const digits = event.target.value.replace(/\D/g, '').slice(0, String(max).length)
        setText(digits)
        if (digits !== '') onChange(Math.min(max, Math.max(min, Number(digits))))
      }}
      onBlur={() => setText(null)}
    />
  )
}
