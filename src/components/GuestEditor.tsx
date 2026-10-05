import { useState } from 'react'
import { setGuestInfo } from '../api'
import type { Stay } from '../types'
import { btn, btnPrimary, fieldLabel, input } from './ui'

// Tên và số điện thoại của khách, sửa được sau khi đã nhận phòng hoặc đặt trước.
export function GuestEditor({ stay }: { stay: Stay }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(stay.guestName)
  const [phone, setPhone] = useState(stay.guestPhone)

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="min-w-0 truncate text-slate-800">
          {stay.guestName || 'Không ghi tên'}
          {stay.guestPhone && ` · ${stay.guestPhone}`}
        </span>
        <button
          type="button"
          className={`${btn} shrink-0`}
          onClick={() => {
            setName(stay.guestName)
            setPhone(stay.guestPhone)
            setEditing(true)
          }}
        >
          Sửa khách
        </button>
      </div>
    )
  }

  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault()
        setGuestInfo(stay.id, name.trim(), phone.trim())
        setEditing(false)
      }}
    >
      <div className="grid grid-cols-2 gap-2">
        <label>
          <span className={fieldLabel}>Tên khách</span>
          <input className={input} value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          <span className={fieldLabel}>Điện thoại</span>
          <input type="tel" className={input} value={phone} onChange={(event) => setPhone(event.target.value)} />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={btn} onClick={() => setEditing(false)}>
          Thôi
        </button>
        <button type="submit" className={btnPrimary}>
          Lưu
        </button>
      </div>
    </form>
  )
}
