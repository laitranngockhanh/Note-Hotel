import { useState } from 'react'
import { addStayNote } from '../api'
import { dayMonth, time } from '../lib/format'
import type { Stay } from '../types'
import { btn, input } from './ui'

// Ghi chú của một lượt thuê. Chỉ thêm, không sửa hay xóa: khi nhập nhầm (ví dụ bấm tiền
// mặt thay vì chuyển khoản) thì ghi lại ở đây để chủ đọc trong báo cáo.
export function StayNotes({ stay }: { stay: Stay }) {
  const [text, setText] = useState('')

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-slate-500">Ghi chú</p>
      {stay.notes.map((note) => (
        <p key={note.id} className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
          {note.text}
          <span className="block text-xs text-amber-700">
            {note.by && `${note.by} · `}
            {time(note.at)} {dayMonth(note.at)}
          </span>
        </p>
      ))}
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (!text.trim()) return
          addStayNote(stay.id, text.trim())
          setText('')
        }}
      >
        <input
          className={input}
          placeholder="Khách chuyển khoản, bấm nhầm tiền mặt"
          aria-label="Nội dung ghi chú"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <button type="submit" className={`${btn} shrink-0`}>
          Thêm
        </button>
      </form>
    </div>
  )
}
