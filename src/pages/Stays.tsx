import { useEffect, useState } from 'react'
import { fetchStays, useDb, type StayList } from '../api'
import { GuestEditor } from '../components/GuestEditor'
import Modal from '../components/Modal'
import { StayNotes } from '../components/Notes'
import { StayPhotos } from '../components/Photos'
import { btn, btnPrimary, input } from '../components/ui'
import { useNow } from '../hooks/useNow'
import { itemAmount, settingsOfRoom, stayBill } from '../lib/bill'
import { dayMonth, money, time } from '../lib/format'
import { METHOD_LABEL, RENT_LABEL, STAY_STATUS_LABEL } from '../lib/labels'
import type { Payment, Stay, StayStatus } from '../types'

const FILTERS: StayStatus[] = ['active', 'booked', 'done', 'cancelled']
const MAX_ROWS = 100

interface Props {
  propertyId: string
}

// Danh sách lượt thuê của cơ sở: đang ở, đặt trước, đã trả, đã hủy.
export default function Stays({ propertyId }: Props) {
  const db = useDb()
  const now = useNow()
  const [filter, setFilter] = useState<StayStatus>('active')
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [list, setList] = useState<StayList | null>(null)
  const [failed, setFailed] = useState('')

  // Chờ người dùng ngừng gõ một chút rồi mới tìm, để không gọi máy chủ theo từng phím.
  const [search, setSearch] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query), 300)
    return () => clearTimeout(timer)
  }, [query])

  // Danh sách lấy từ máy chủ, vì lượt đã trả và đã hủy không nằm trong dữ liệu của màn hình
  // chính. Tải lại mỗi khi dữ liệu chung đổi (db), để ghi chú hay tên khách vừa sửa hiện ngay.
  useEffect(() => {
    let cancelled = false
    fetchStays(propertyId, filter, search)
      .then((next) => {
        if (cancelled) return
        setList(next)
        setFailed('')
      })
      .catch((error: unknown) => {
        if (!cancelled) setFailed(error instanceof Error ? error.message : 'Không tải được danh sách.')
      })
    return () => {
      cancelled = true
    }
  }, [propertyId, filter, search, db])

  const roomNumbers = new Map(db.rooms.map((room) => [room.id, room.number]))
  // Đang chuyển sang bộ lọc khác thì chưa hiện danh sách của bộ lọc cũ.
  const stays = (list?.stays ?? []).filter((stay) => stay.status === filter)
  const payments = list?.payments ?? []
  const open = stays.find((stay) => stay.id === openId)

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto">
        {FILTERS.map((status) => (
          <button
            key={status}
            type="button"
            aria-pressed={filter === status}
            className={`${filter === status ? btnPrimary : btn} shrink-0`}
            onClick={() => setFilter(status)}
          >
            {STAY_STATUS_LABEL[status]}
          </button>
        ))}
      </div>

      <input
        className={input}
        placeholder="Anh Minh, 0900 000 000 hoặc 102"
        aria-label="Tìm theo tên khách, số điện thoại hoặc số phòng"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      {failed && <p className="text-sm text-red-600">{failed}</p>}
      {stays.length === 0 && (
        <p className="py-6 text-center text-sm text-slate-500">
          {list === null && !failed ? 'Đang tải…' : 'Không có lượt thuê nào.'}
        </p>
      )}

      <ul className="divide-y divide-slate-100 rounded-xl bg-white ring-1 ring-slate-200">
        {stays.map((stay) => {
          const bill = stayBill(stay, payments, now, settingsOfRoom(db, stay.roomId))
          return (
            <li key={stay.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left active:bg-slate-50"
                onClick={() => setOpenId(stay.id)}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-slate-800">
                    Phòng {roomNumbers.get(stay.roomId)} · {stay.guestName || 'Không ghi tên'}
                  </span>
                  <span className="block truncate text-xs text-slate-500">
                    {RENT_LABEL[stay.rentType]} · {stay.status === 'booked' ? 'đến' : 'vào'} {time(stay.checkInAt)}{' '}
                    {dayMonth(stay.checkInAt)}
                    {stay.checkOutAt && ` · ra ${time(stay.checkOutAt)} ${dayMonth(stay.checkOutAt)}`}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-medium text-slate-800">
                  {stay.status === 'booked' || stay.status === 'cancelled'
                    ? bill.paid > 0
                      ? `Cọc ${money(bill.paid)}`
                      : ''
                    : money(bill.total)}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      {stays.length >= MAX_ROWS && (
        <p className="text-center text-xs text-slate-500">Đang hiện {MAX_ROWS} lượt gần nhất. Tìm theo tên để thu hẹp.</p>
      )}

      {open && (
        <StayDetail
          stay={open}
          payments={payments.filter((payment) => payment.stayId === open.id)}
          collectors={list?.collectors ?? {}}
          roomNumber={roomNumbers.get(open.roomId) ?? ''}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  )
}

interface DetailProps {
  stay: Stay
  payments: Payment[]
  collectors: Record<string, string>
  roomNumber: string
  onClose: () => void
}

function StayDetail({ stay, payments, collectors, roomNumber, onClose }: DetailProps) {
  const db = useDb()
  const now = useNow()
  const bill = stayBill(stay, payments, now, settingsOfRoom(db, stay.roomId))
  const collectorOf = (shiftId: string) => collectors[shiftId] ?? ''

  return (
    <Modal title={`Phòng ${roomNumber}`} subtitle={STAY_STATUS_LABEL[stay.status]} onClose={onClose}>
      <div className="space-y-4 text-sm">
        <GuestEditor stay={stay} />

        <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
          <dt className="text-slate-500">Số người</dt>
          <dd className="text-right text-slate-800">{stay.guestCount}</dd>
          <dt className="text-slate-500">Kiểu thuê</dt>
          <dd className="text-right text-slate-800">{RENT_LABEL[stay.rentType]}</dd>
          <dt className="text-slate-500">{stay.status === 'booked' ? 'Dự kiến đến' : 'Vào lúc'}</dt>
          <dd className="text-right text-slate-800">
            {time(stay.checkInAt)} {dayMonth(stay.checkInAt)}
          </dd>
          {stay.checkOutAt && (
            <>
              <dt className="text-slate-500">Ra lúc</dt>
              <dd className="text-right text-slate-800">
                {time(stay.checkOutAt)} {dayMonth(stay.checkOutAt)}
              </dd>
            </>
          )}
        </dl>

        {/* Ảnh chỉ còn với lượt đang ở hoặc đặt trước; trả phòng hay hủy là ảnh đã bị xóa. */}
        <StayPhotos stay={stay} canEdit={stay.status === 'active' || stay.status === 'booked'} />

        <div className="rounded-xl bg-slate-50 p-3">
          {bill.charge.lines.map((line) => (
            <div key={line.label} className="flex justify-between py-1">
              <span>{line.label}</span>
              <span>{money(line.amount)}</span>
            </div>
          ))}
          {bill.extraGuestAmount > 0 && (
            <div className="flex justify-between py-1">
              <span>Thêm {bill.extraGuests} người</span>
              <span>{money(bill.extraGuestAmount)}</span>
            </div>
          )}
          {stay.items.map((item) => {
            const amount = itemAmount(item)
            return (
              <div key={item.id} className="flex justify-between py-1">
                <span>
                  {item.kind === 'discount' && 'Giảm giá: '}
                  {item.name}
                  {item.qty > 1 && ` × ${item.qty}`}
                </span>
                <span>{money(amount)}</span>
              </div>
            )
          })}
          <div className="mt-1 flex justify-between border-t border-slate-200 pt-2 font-semibold text-slate-800">
            <span>Tổng tiền</span>
            <span>{money(bill.total)} đ</span>
          </div>
        </div>

        <div>
          <h3 className="mb-1 font-semibold text-slate-800">Các lần thu</h3>
          {payments.length === 0 && <p className="text-slate-500">Chưa thu khoản nào.</p>}
          {payments.map((payment) => (
            <div key={payment.id} className="flex justify-between py-1">
              <span className="text-slate-600">
                {time(payment.at)} {dayMonth(payment.at)} · {METHOD_LABEL[payment.method]} · {collectorOf(payment.shiftId)}
              </span>
              <span>{money(payment.amount)}</span>
            </div>
          ))}
        </div>

        <StayNotes stay={stay} />

        {stay.status === 'active' && (
          <p className="text-xs text-slate-500">Lượt đang ở: thao tác thêm dịch vụ và thanh toán nằm ở sơ đồ phòng.</p>
        )}
      </div>
    </Modal>
  )
}
