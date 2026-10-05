import { Fragment } from 'react'
import { useDb } from '../api'
import { floorBody, floorColumns, floorScroll } from '../components/ui'
import { useNow } from '../hooks/useNow'
import { settingsOfRoom, stayBill } from '../lib/bill'
import { isLate } from '../lib/booking'
import { dateKey, dayMonth, duration, money, time } from '../lib/format'
import { CONDITION_LABEL, RENT_LABEL } from '../lib/labels'
import type { Db, Room } from '../types'

const MINUTE_MS = 60_000

const TILE_STYLE = {
  ready: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  occupied: 'bg-rose-50 text-rose-800 ring-rose-200',
  cleaning: 'bg-amber-50 text-amber-800 ring-amber-200',
  maintenance: 'bg-slate-100 text-slate-500 ring-slate-200',
}

const LEGEND = [
  { label: 'Trống', style: 'bg-emerald-50 ring-emerald-300' },
  { label: 'Đang thuê', style: 'bg-rose-50 ring-rose-300' },
  { label: 'Chờ dọn', style: 'bg-amber-50 ring-amber-300' },
  { label: 'Bảo trì', style: 'bg-slate-100 ring-slate-300' },
]

interface Props {
  propertyId: string
  onSelect: (roomId: string) => void
}

export default function RoomMap({ propertyId, onSelect }: Props) {
  const db = useDb()
  const now = useNow()
  const propertyRooms = db.rooms.filter((room) => room.propertyId === propertyId)
  const floors = [...new Set(propertyRooms.map((room) => room.floor))].sort((a, b) => b - a)

  if (propertyRooms.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-slate-500">
        Cơ sở này chưa có phòng nào. Chủ vào Quản lý: thêm loại phòng và giá ở mục Cài đặt, rồi thêm phòng ở mục
        Sơ đồ.
      </p>
    )
  }

  return (
    <div className="space-y-6">
      {floors.map((floor) => {
        const rooms = propertyRooms.filter((room) => room.floor === floor)
        const cols = Math.max(...rooms.map((room) => room.col))
        const rows = [...new Set(rooms.map((room) => room.row))].sort((a, b) => a - b)
        return (
          <section key={floor}>
            <h2 className="mb-2 text-sm font-medium text-slate-500">Tầng {floor}</h2>
            <div className={floorScroll}>
              <div className={floorBody}>
                {rows.map((row, index) => (
                  <Fragment key={row}>
                    {index > 0 && (
                      <div className="my-2 border-y border-dashed border-slate-300 py-1 text-center text-xs text-slate-400">
                        Hành lang
                      </div>
                    )}
                    <div className="grid gap-2" style={{ gridTemplateColumns: floorColumns(cols) }}>
                      {rooms
                        .filter((room) => room.row === row)
                        .map((room) => (
                          <RoomTile key={room.id} db={db} room={room} now={now} onSelect={onSelect} />
                        ))}
                    </div>
                  </Fragment>
                ))}
              </div>
            </div>
          </section>
        )
      })}

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        {LEGEND.map((item) => (
          <span key={item.label} className="flex items-center gap-1.5">
            <span className={`size-3 rounded-full ring-1 ${item.style}`} />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  )
}

interface TileProps {
  db: Db
  room: Room
  now: Date
  onSelect: (roomId: string) => void
}

function RoomTile({ db, room, now, onSelect }: TileProps) {
  const stay = db.stays.find((s) => s.roomId === room.id && s.status === 'active')
  const booking = db.stays
    .filter((s) => s.roomId === room.id && s.status === 'booked')
    .sort((a, b) => a.checkInAt.localeCompare(b.checkInAt))[0]
  const settings = settingsOfRoom(db, room.id)
  const bill = stay ? stayBill(stay, db.payments, now, settings) : null
  const overdue = bill !== null && bill.charge.overdueMinutes > settings.graceMinutes

  let detail: string
  let checkedIn = ''
  if (stay && bill) {
    const due = bill.charge.dueAt
    detail = due
      ? `đến ${time(due)} ${dayMonth(due)}`
      : duration((now.getTime() - new Date(stay.checkInAt).getTime()) / MINUTE_MS)
    // Khách vào từ hôm trước thì ghi thêm ngày, để không lẫn với giờ của hôm nay.
    const sameDay = dateKey(new Date(stay.checkInAt)) === dateKey(now)
    checkedIn = `Vào ${time(stay.checkInAt)}${sameDay ? '' : ` ${dayMonth(stay.checkInAt)}`}`
  } else {
    detail = CONDITION_LABEL[room.condition]
  }

  return (
    <button
      type="button"
      onClick={() => onSelect(room.id)}
      aria-label={`Phòng ${room.number}, ${stay ? 'đang thuê' : CONDITION_LABEL[room.condition].toLowerCase()}`}
      style={{ gridColumn: room.col }}
      className={`flex min-h-24 flex-col items-start rounded-xl p-2 text-left ring-1 transition active:scale-95 ${
        TILE_STYLE[stay ? 'occupied' : room.condition]
      } ${overdue ? 'ring-2 ring-rose-500' : ''}`}
    >
      <span className="text-base font-semibold">{room.number}</span>
      {stay && <span className="text-xs">{RENT_LABEL[stay.rentType]}</span>}
      {checkedIn && <span className="text-xs">{checkedIn}</span>}
      <span className="text-xs">{detail}</span>
      {overdue && <span className="text-xs font-medium">Quá hạn</span>}
      {booking && (
        // Quá giờ hẹn mà khách chưa đến thì đổi thành "Trễ hẹn" để người trực xử lý.
        <span className={`text-xs font-medium ${isLate(booking, now) ? 'text-rose-700' : ''}`}>
          {isLate(booking, now) ? 'Trễ hẹn' : 'Đặt'} {time(booking.checkInAt)} {dayMonth(booking.checkInAt)}
        </span>
      )}
      {bill && <span className="mt-auto pt-1 text-xs font-semibold">{money(bill.due)}</span>}
    </button>
  )
}
