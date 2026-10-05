import { useState } from 'react'
import { closeShift, useDb } from '../api'
import Modal from '../components/Modal'
import MoneyInput from '../components/MoneyInput'
import { btn, btnPrimary, input } from '../components/ui'
import { money, time } from '../lib/format'
import type { Shift } from '../types'

interface Props {
  shift: Shift
  title: string
  onCancel?: () => void
  onDone: () => void
}

export default function EndShift({ shift, title, onCancel, onDone }: Props) {
  const db = useDb()
  const [showTransfers, setShowTransfers] = useState(false)
  const [mismatch, setMismatch] = useState(false)
  const [short, setShort] = useState(true)
  const [amount, setAmount] = useState(0)
  const [note, setNote] = useState('')
  const [error, setError] = useState(false)

  const payments = db.payments.filter((payment) => payment.shiftId === shift.id)
  const sumOf = (method: string) =>
    payments.filter((p) => p.method === method).reduce((sum, p) => sum + p.amount, 0)
  const cash = sumOf('cash')
  const transfer = sumOf('transfer')
  const transfers = payments.filter((p) => p.method === 'transfer')
  // Như báo cáo: chỉ đếm lượt khách đã thật sự vào ở; đặt trước và đã hủy không tính.
  const checkIns = db.stays.filter(
    (stay) => stay.shiftId === shift.id && (stay.status === 'active' || stay.status === 'done'),
  ).length

  const roomOf = (stayId: string) => {
    const stay = db.stays.find((s) => s.id === stayId)
    return db.rooms.find((room) => room.id === stay?.roomId)?.number ?? ''
  }

  // Chờ máy chủ đóng ca xong rồi mới sang bước sau (khóa máy hoặc mở ca mới). Đóng không
  // được thì ở lại màn hình này; lỗi hiện ở thanh thông báo chung.
  const finish = async (cashDiff: number, text: string) => {
    if (await closeShift(shift.id, cashDiff, text)) onDone()
  }

  return (
    <Modal
      title={title}
      subtitle={`Ca ${shift.label.toLowerCase()} · ${shift.userName} · ${checkIns} lượt nhận phòng`}
      onClose={onCancel}
    >
      <div className="space-y-4">
        <div className="rounded-xl bg-slate-50 p-3 text-sm">
          <div className="flex justify-between py-1">
            <span>Tiền mặt</span>
            <span className="font-medium">{money(cash)}</span>
          </div>
          <div className="flex justify-between py-1">
            <button
              type="button"
              className="underline decoration-dotted"
              aria-expanded={showTransfers}
              onClick={() => setShowTransfers(!showTransfers)}
            >
              Chuyển khoản ({transfers.length} khoản)
            </button>
            <span className="font-medium">{money(transfer)}</span>
          </div>
          {showTransfers &&
            transfers.map((payment) => (
              <div key={payment.id} className="flex justify-between py-0.5 pl-3 text-xs text-slate-500">
                <span>
                  {time(payment.at)} · Phòng {roomOf(payment.stayId)}
                </span>
                <span>{money(payment.amount)}</span>
              </div>
            ))}
          <div className="mt-1 flex justify-between border-t border-slate-200 pt-2 text-base font-semibold text-slate-800">
            <span>Tổng ca</span>
            <span>{money(cash + transfer)} đ</span>
          </div>
        </div>

        <p className="text-sm text-slate-600">
          Đếm tiền mặt trong két và so với {money(cash)} đ.
        </p>

        {/* Ghi chú dùng cho cả ca khớp lẫn ca lệch: có gì nhầm trong ca thì báo lại ở đây. */}
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">Ghi chú của ca (không bắt buộc)</span>
          <input
            className={input}
            placeholder="Phòng 102 chuyển khoản, bấm nhầm tiền mặt"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>

        {mismatch ? (
          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault()
              if (amount <= 0) {
                setError(true)
                return
              }
              finish(short ? -amount : amount, note.trim())
            }}
          >
            <div className="grid grid-cols-2 gap-2">
              <button type="button" aria-pressed={short} className={short ? btnPrimary : btn} onClick={() => setShort(true)}>
                Thiếu
              </button>
              <button type="button" aria-pressed={!short} className={short ? btn : btnPrimary} onClick={() => setShort(false)}>
                Thừa
              </button>
            </div>
            <MoneyInput
              ariaLabel="Số tiền lệch"
              value={amount}
              onChange={(value) => {
                setAmount(value)
                setError(false)
              }}
            />
            {error && <p className="text-sm text-red-600">Nhập số tiền lệch.</p>}
            <button type="submit" className={`${btnPrimary} w-full py-3`}>
              Xác nhận lệch và kết thúc ca
            </button>
            <button type="button" className="w-full py-2 text-center text-sm text-slate-500 underline" onClick={() => setMismatch(false)}>
              Quay lại
            </button>
          </form>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={`${btn} py-3`} onClick={() => setMismatch(true)}>
              Lệch
            </button>
            <button type="button" className={`${btnPrimary} py-3`} onClick={() => finish(0, note.trim())}>
              Khớp
            </button>
          </div>
        )}
      </div>
    </Modal>
  )
}
