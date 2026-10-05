import { QRCodeSVG } from 'qrcode.react'
import { useState } from 'react'
import {
  addItem,
  addPayment,
  arriveBooking,
  bookRoom,
  cancelBooking,
  changeRentType,
  checkIn,
  checkOut,
  extendStay,
  moveStay,
  openShiftOf,
  removeItem,
  removePayment,
  serverNow,
  setBookingTime,
  setGuestCount,
  setRoomCondition,
  useDb,
} from '../api'
import { GuestEditor } from '../components/GuestEditor'
import Modal from '../components/Modal'
import MoneyInput from '../components/MoneyInput'
import NumberInput from '../components/NumberInput'
import { StayNotes } from '../components/Notes'
import { PendingPhotos, StayPhotos, attachAll } from '../components/Photos'
import { btn, btnPrimary, fieldLabel, input, removeButton } from '../components/ui'
import { useNow } from '../hooks/useNow'
import { itemAmount, settingsOfRoom, stayBill } from '../lib/bill'
import { findConflicts, isLate, stayWindow } from '../lib/booking'
import { dateKey, dayMonth, duration, money, time } from '../lib/format'
import { METHOD_LABEL, PERIOD_UNIT, RENT_LABEL, RENT_TYPES } from '../lib/labels'
import { overnightAllowed, overnightWindowLabel } from '../lib/pricing'
import { bankName, buildVietQr } from '../lib/vietqr'
import type { BankAccount, PaymentMethod, PriceList, RentType, Room, RoomType, Settings, Stay } from '../types'

const MINUTE_MS = 60_000
const METHODS: PaymentMethod[] = ['cash', 'transfer']

// Các ô giá hiện ra theo kiểu thuê lúc nhận phòng.
const PRICE_FIELDS: Record<RentType, { key: keyof PriceList; label: string }[]> = {
  hour: [
    { key: 'firstHour', label: 'Giờ đầu' },
    { key: 'nextHour', label: 'Mỗi giờ tiếp theo' },
  ],
  overnight: [{ key: 'overnight', label: 'Giá qua đêm' }],
  day: [{ key: 'day', label: 'Giá mỗi ngày' }],
  week: [{ key: 'week', label: 'Giá mỗi tuần' }],
  month: [{ key: 'month', label: 'Giá mỗi tháng' }],
}

const linkButton = 'w-full py-2 text-center text-sm text-slate-500 underline'

interface Props {
  roomId: string
  // Người đang thao tác có được sửa giá không; tùy vai trò và cài đặt của cơ sở.
  canEditPrice: boolean
  onClose: () => void
}

export default function RoomSheet({ roomId, canEditPrice, onClose }: Props) {
  const db = useDb()
  const [booking, setBooking] = useState(false)
  const room = db.rooms.find((r) => r.id === roomId)!
  const type = db.roomTypes.find((t) => t.id === room.typeId)!
  const stay = db.stays.find((s) => s.roomId === roomId && s.status === 'active')
  const bookings = db.stays
    .filter((s) => s.roomId === roomId && s.status === 'booked')
    .sort((a, b) => a.checkInAt.localeCompare(b.checkInAt))

  if (booking) {
    return (
      <Modal title={`Đặt trước phòng ${room.number}`} subtitle={type.name} onClose={onClose}>
        <BookingForm room={room} type={type} canEditPrice={canEditPrice} onDone={() => setBooking(false)} />
      </Modal>
    )
  }

  return (
    <Modal title={`Phòng ${room.number}`} subtitle={type.name} onClose={onClose}>
      <div className="space-y-4">
        {bookings.length > 0 && (
          <BookingList bookings={bookings} canArrive={!stay && room.condition === 'ready'} />
        )}

        {stay ? (
          <OccupiedPanel stay={stay} canEditPrice={canEditPrice} onClose={onClose} />
        ) : room.condition === 'ready' ? (
          <CheckInForm room={room} type={type} canEditPrice={canEditPrice} onClose={onClose} />
        ) : (
          <ConditionPanel room={room} onClose={onClose} />
        )}

        <button type="button" className={linkButton} onClick={() => setBooking(true)}>
          Đặt trước phòng này
        </button>
      </div>
    </Modal>
  )
}

function BookingList({ bookings, canArrive }: { bookings: Stay[]; canArrive: boolean }) {
  return (
    <div className="space-y-2">
      {bookings.map((booking) => (
        <BookingCard key={booking.id} booking={booking} canArrive={canArrive} />
      ))}
    </div>
  )
}

// Danh sách phòng để chuyển một lượt thuê sang. Khách đang ở thì chỉ chuyển được sang
// phòng trống đã sẵn sàng; lượt đặt trước thì sang phòng nào không bảo trì cũng được.
function RoomPicker({ stay, onPick }: { stay: Stay; onPick: (roomId: string) => void }) {
  const db = useDb()
  const current = db.rooms.find((room) => room.id === stay.roomId)!
  const occupied = (roomId: string) => db.stays.some((s) => s.roomId === roomId && s.status === 'active')
  const rooms = db.rooms.filter((room) => {
    if (room.propertyId !== current.propertyId || room.id === current.id) return false
    if (stay.status === 'active') return room.condition === 'ready' && !occupied(room.id)
    return room.condition !== 'maintenance'
  })

  if (rooms.length === 0) return <p className="text-xs">Không có phòng nào để chuyển sang.</p>
  return (
    <div className="grid grid-cols-4 gap-2">
      {rooms.map((room) => (
        <button key={room.id} type="button" className={btn} onClick={() => onPick(room.id)}>
          {room.number}
        </button>
      ))}
    </div>
  )
}

function BookingCard({ booking, canArrive }: { booking: Stay; canArrive: boolean }) {
  const db = useDb()
  const now = useNow()
  const [mode, setMode] = useState<'cancel' | 'time' | 'room' | 'guest' | null>(null)
  const [expectedAt, setExpectedAt] = useState(() => toLocalInput(new Date(booking.checkInAt)))
  const cancelling = mode === 'cancel'
  const late = isLate(booking, now)
  const deposit = db.payments
    .filter((payment) => payment.stayId === booking.id)
    .reduce((sum, payment) => sum + payment.amount, 0)

  return (
    <div
      className={`rounded-xl p-3 text-sm ring-1 ${
        late ? 'bg-rose-50 text-rose-900 ring-rose-200' : 'bg-sky-50 text-sky-900 ring-sky-200'
      }`}
    >
      <p className="font-medium">
        {late ? 'Trễ hẹn' : 'Đặt trước'} · đến {time(booking.checkInAt)} {dayMonth(booking.checkInAt)} ·{' '}
        {RENT_LABEL[booking.rentType]}
      </p>
      <p className="text-xs">
        {booking.guestName || 'Không ghi tên'}
        {booking.guestPhone && ` · ${booking.guestPhone}`}
        {deposit > 0 && ` · đã cọc ${money(deposit)}`}
        {booking.photos.length > 0 && ` · ${booking.photos.length} ảnh giấy tờ`}
      </p>
      {late && <p className="mt-1 text-xs">Đã quá giờ hẹn mà khách chưa đến. Gọi khách, đổi giờ hoặc hủy đặt.</p>}

      {mode === 'time' && (
        <form
          className="mt-2 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            const next = new Date(expectedAt)
            if (Number.isNaN(next.getTime())) return
            setBookingTime(booking.id, next.toISOString())
            setMode(null)
          }}
        >
          <input
            type="datetime-local"
            aria-label="Giờ khách đến mới"
            className={input}
            value={expectedAt}
            onChange={(event) => setExpectedAt(event.target.value)}
          />
          <button type="submit" className={`${btnPrimary} shrink-0`}>
            Lưu
          </button>
        </form>
      )}

      {mode === 'room' && (
        <div className="mt-2 space-y-1">
          <p className="text-xs">Chuyển lượt đặt này sang phòng:</p>
          <RoomPicker stay={booking} onPick={(roomId) => moveStay(booking.id, roomId)} />
        </div>
      )}

      {/* Khách đặt qua điện thoại thường chưa có đủ tên, số, giấy tờ: bổ sung được trước khi khách đến. */}
      {mode === 'guest' && (
        <div className="mt-2 space-y-3 rounded-lg bg-white p-3 text-slate-800 ring-1 ring-slate-200">
          <GuestEditor stay={booking} />
          <StayPhotos stay={booking} canEdit />
        </div>
      )}

      {cancelling ? (
        // Có cọc thì hỏi giữ hay hoàn, vì mỗi lần hủy chủ có thể quyết định khác nhau.
        <div className="mt-2 space-y-2">
          <p className="text-xs">Khách đã cọc {money(deposit)} đ. Xử lý tiền cọc thế nào?</p>
          <div className="grid grid-cols-3 gap-2">
            <button type="button" className={btn} onClick={() => cancelBooking(booking.id)}>
              Giữ cọc
            </button>
            {METHODS.map((method) => (
              <button key={method} type="button" className={btn} onClick={() => cancelBooking(booking.id, method)}>
                Hoàn {METHOD_LABEL[method].toLowerCase()}
              </button>
            ))}
          </div>
          <button type="button" className={linkButton} onClick={() => setMode(null)}>
            Không hủy nữa
          </button>
        </div>
      ) : (
        <div className="mt-2 grid grid-cols-2 gap-2">
          {canArrive ? (
            <button type="button" className={btnPrimary} onClick={() => arriveBooking(booking.id)}>
              Khách đến, nhận phòng
            </button>
          ) : (
            <span className="self-center text-xs">Phòng chưa sẵn sàng để nhận.</span>
          )}
          <button
            type="button"
            className={btn}
            onClick={() => (deposit > 0 ? setMode('cancel') : cancelBooking(booking.id))}
          >
            Hủy đặt
          </button>
          <button type="button" className={btn} onClick={() => setMode(mode === 'time' ? null : 'time')}>
            Đổi giờ đến
          </button>
          <button type="button" className={btn} onClick={() => setMode(mode === 'room' ? null : 'room')}>
            Đổi phòng
          </button>
          <button
            type="button"
            className={`${btn} col-span-2`}
            onClick={() => setMode(mode === 'guest' ? null : 'guest')}
          >
            Sửa khách, ảnh giấy tờ
          </button>
        </div>
      )}
    </div>
  )
}

function ConditionPanel({ room, onClose }: { room: Room; onClose: () => void }) {
  const cleaning = room.condition === 'cleaning'
  return (
    <div>
      <p className="text-sm text-slate-600">
        {cleaning ? 'Phòng đang chờ dọn sau khi khách trả.' : 'Phòng đang bảo trì, chưa nhận khách.'}
      </p>
      <button
        type="button"
        className={`${btnPrimary} mt-4 w-full`}
        onClick={() => {
          setRoomCondition(room.id, 'ready')
          onClose()
        }}
      >
        {cleaning ? 'Đã dọn xong' : 'Hết bảo trì'}
      </button>
    </div>
  )
}

interface RentValue {
  rentType: RentType
  periods: number
  prices: PriceList
}

interface RentFieldsProps {
  value: RentValue
  canEditPrice: boolean
  onChange: (value: RentValue) => void
}

// Kiểu thuê, giá và số kỳ. Dùng chung cho nhận phòng và đặt trước.
function RentFields({ value, canEditPrice, onChange }: RentFieldsProps) {
  const unit = PERIOD_UNIT[value.rentType]
  return (
    <>
      <div>
        <span className={fieldLabel}>Kiểu thuê</span>
        <div className="grid grid-cols-3 gap-2">
          {RENT_TYPES.map((rentType) => (
            <button
              key={rentType}
              type="button"
              aria-pressed={value.rentType === rentType}
              onClick={() => onChange({ ...value, rentType })}
              className={value.rentType === rentType ? btnPrimary : btn}
            >
              {RENT_LABEL[rentType]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {PRICE_FIELDS[value.rentType].map((field) => (
          <label key={field.key}>
            <span className={fieldLabel}>{field.label}</span>
            <MoneyInput
              value={value.prices[field.key]}
              readOnly={!canEditPrice}
              onChange={(price) => onChange({ ...value, prices: { ...value.prices, [field.key]: price } })}
            />
          </label>
        ))}
        {unit && (
          <label>
            <span className={fieldLabel}>Số {unit}</span>
            <NumberInput
              min={1}
              max={120}
              value={value.periods}
              onChange={(periods) => onChange({ ...value, periods })}
            />
          </label>
        )}
      </div>
    </>
  )
}

interface GuestValue {
  guestName: string
  guestPhone: string
  guestCount: number
}

function GuestFields({
  value,
  type,
  onChange,
}: {
  value: GuestValue
  type: RoomType
  onChange: (value: GuestValue) => void
}) {
  const extra = Math.max(0, value.guestCount - type.standardGuests)
  return (
    <div className="grid grid-cols-2 gap-3">
      <label>
        <span className={fieldLabel}>Tên khách</span>
        <input
          className={input}
          value={value.guestName}
          onChange={(event) => onChange({ ...value, guestName: event.target.value })}
        />
      </label>
      <label>
        <span className={fieldLabel}>Điện thoại</span>
        <input
          type="tel"
          className={input}
          value={value.guestPhone}
          onChange={(event) => onChange({ ...value, guestPhone: event.target.value })}
        />
      </label>
      <label>
        <span className={fieldLabel}>Số người (tiêu chuẩn {type.standardGuests})</span>
        <NumberInput
          min={1}
          max={50}
          value={value.guestCount}
          onChange={(guestCount) => onChange({ ...value, guestCount })}
        />
      </label>
      {extra > 0 && type.extraGuestFee > 0 && (
        <p className="self-end pb-2 text-xs text-amber-700">
          Thêm {extra} người: phụ thu {money(extra * type.extraGuestFee)} đ
        </p>
      )}
    </div>
  )
}

const emptyGuest: GuestValue = { guestName: '', guestPhone: '', guestCount: 1 }

// Số kỳ chỉ có nghĩa với thuê ngày, tuần, tháng.
const periodsOf = (rent: RentValue) => (PERIOD_UNIT[rent.rentType] ? rent.periods : 1)

interface StayFormProps {
  room: Room
  type: RoomType
  canEditPrice: boolean
}

// Câu cảnh báo khi lượt sắp tạo đè lên một lượt khác của cùng phòng.
function conflictText(other: Stay, settings: Settings): string {
  const who = other.guestName ? ` (${other.guestName})` : ''
  if (other.status === 'booked') {
    return `Phòng này đã có khách đặt${who}, hẹn đến ${time(other.checkInAt)} ${dayMonth(other.checkInAt)}.`
  }
  if (other.rentType === 'hour') return `Phòng đang có khách thuê giờ${who}.`
  const end = stayWindow(other, settings).end
  return `Phòng đang có khách${who}, hạn trả ${time(end)} ${dayMonth(end)}.`
}

function CheckInForm({ room, type, canEditPrice, onClose }: StayFormProps & { onClose: () => void }) {
  const db = useDb()
  const settings = settingsOfRoom(db, room.id)
  const [rent, setRent] = useState<RentValue>({ rentType: 'hour', periods: 1, prices: { ...type.prices } })
  const [guest, setGuest] = useState(emptyGuest)
  const [photos, setPhotos] = useState<Blob[]>([])
  const [error, setError] = useState('')
  // Cảnh báo trùng lịch: hiện một lần, bấm lần nữa là vẫn nhận.
  const [warning, setWarning] = useState('')

  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault()
        const now = serverNow()
        if (rent.rentType === 'overnight' && !overnightAllowed(now, settings)) {
          return setError(`Qua đêm chỉ nhận từ ${overnightWindowLabel(settings)}. Chọn kiểu thuê khác.`)
        }
        const input = { roomId: room.id, ...rent, periods: periodsOf(rent), ...guest }
        if (!warning) {
          const window = stayWindow({ ...input, checkInAt: now.toISOString() }, settings)
          const [conflict] = findConflicts(db.stays, room.id, window, settings, now)
          if (conflict) return setWarning(conflictText(conflict, settings))
        }
        // Máy chủ từ chối (ví dụ máy khác vừa nhận phòng này) thì ở lại form; lỗi hiện ở
        // thanh thông báo chung.
        const stayId = await checkIn(input)
        if (!stayId) return
        await attachAll(stayId, photos)
        onClose()
      }}
    >
      <RentFields
        value={rent}
        canEditPrice={canEditPrice}
        onChange={(value) => {
          setRent(value)
          setError('')
          setWarning('')
        }}
      />
      <GuestFields value={guest} type={type} onChange={setGuest} />
      <PendingPhotos blobs={photos} onChange={setPhotos} />

      {error && <p className="text-sm text-red-600">{error}</p>}
      {warning && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 ring-1 ring-amber-200" role="alert">
          {warning} Bấm lần nữa nếu vẫn muốn nhận.
        </p>
      )}

      <button type="submit" className={`${btnPrimary} w-full py-3`}>
        {warning ? 'Vẫn nhận phòng' : 'Nhận phòng'}
      </button>
      <button
        type="button"
        className={linkButton}
        onClick={() => {
          setRoomCondition(room.id, 'maintenance')
          onClose()
        }}
      >
        Chuyển phòng sang bảo trì
      </button>
    </form>
  )
}

// Giá trị cho ô datetime-local, theo giờ máy.
function toLocalInput(date: Date): string {
  return `${dateKey(date)}T${time(date)}`
}

function BookingForm({ room, type, canEditPrice, onDone }: StayFormProps & { onDone: () => void }) {
  const db = useDb()
  const settings = settingsOfRoom(db, room.id)
  const [warning, setWarning] = useState('')
  const [rent, setRent] = useState<RentValue>({ rentType: 'day', periods: 1, prices: { ...type.prices } })
  const [guest, setGuest] = useState(emptyGuest)
  const [expectedAt, setExpectedAt] = useState(() => {
    const soon = new Date(serverNow().getTime() + 2 * 60 * MINUTE_MS)
    soon.setMinutes(0, 0, 0)
    return toLocalInput(soon)
  })
  const [deposit, setDeposit] = useState(0)
  const [depositMethod, setDepositMethod] = useState<PaymentMethod>('cash')
  const [photos, setPhotos] = useState<Blob[]>([])
  const [error, setError] = useState('')

  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault()
        const expected = new Date(expectedAt)
        if (Number.isNaN(expected.getTime())) return setError('Chọn ngày giờ khách đến.')
        if (!guest.guestName.trim() && !guest.guestPhone.trim()) {
          return setError('Nhập tên hoặc số điện thoại để nhận ra khách khi họ đến.')
        }
        if (rent.rentType === 'overnight' && !overnightAllowed(expected, settings)) {
          return setError(`Qua đêm chỉ nhận từ ${overnightWindowLabel(settings)}. Đổi giờ đến hoặc kiểu thuê.`)
        }
        const input = { roomId: room.id, ...rent, periods: periodsOf(rent), ...guest }
        if (!warning) {
          const window = stayWindow({ ...input, checkInAt: expected.toISOString() }, settings)
          const [conflict] = findConflicts(db.stays, room.id, window, settings, serverNow())
          if (conflict) return setWarning(conflictText(conflict, settings))
        }
        const stayId = await bookRoom({ ...input, expectedAt: expected.toISOString(), deposit, depositMethod })
        if (!stayId) return
        await attachAll(stayId, photos)
        onDone()
      }}
    >
      <label className="block">
        <span className={fieldLabel}>Khách đến lúc</span>
        <input
          type="datetime-local"
          className={input}
          value={expectedAt}
          onChange={(event) => {
            setExpectedAt(event.target.value)
            setError('')
            setWarning('')
          }}
        />
      </label>

      <RentFields
        value={rent}
        canEditPrice={canEditPrice}
        onChange={(value) => {
          setRent(value)
          setError('')
          setWarning('')
        }}
      />
      <GuestFields
        value={guest}
        type={type}
        onChange={(value) => {
          setGuest(value)
          setError('')
        }}
      />

      <div className="grid grid-cols-2 gap-3">
        <label>
          <span className={fieldLabel}>Tiền cọc (không bắt buộc)</span>
          <MoneyInput value={deposit} onChange={setDeposit} />
        </label>
        <label>
          <span className={fieldLabel}>Hình thức cọc</span>
          <select
            className={input}
            value={depositMethod}
            onChange={(event) => setDepositMethod(event.target.value as PaymentMethod)}
          >
            {METHODS.map((method) => (
              <option key={method} value={method}>
                {METHOD_LABEL[method]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <PendingPhotos blobs={photos} onChange={setPhotos} />

      {error && <p className="text-sm text-red-600">{error}</p>}
      {warning && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 ring-1 ring-amber-200" role="alert">
          {warning} Bấm lần nữa nếu vẫn muốn đặt.
        </p>
      )}

      <button type="submit" className={`${btnPrimary} w-full py-3`}>
        {warning ? 'Vẫn đặt phòng' : 'Đặt phòng'}
      </button>
      <button type="button" className={linkButton} onClick={onDone}>
        Quay lại
      </button>
    </form>
  )
}

type Mode = 'service' | 'surcharge' | 'discount' | 'prepay' | 'rentType' | 'move' | 'checkout' | null

interface OccupiedProps {
  stay: Stay
  canEditPrice: boolean
  onClose: () => void
}

function OccupiedPanel({ stay, canEditPrice, onClose }: OccupiedProps) {
  const db = useDb()
  const now = useNow()
  const [mode, setMode] = useState<Mode>(null)
  const room = db.rooms.find((r) => r.id === stay.roomId)!
  const property = db.properties.find((p) => p.id === room.propertyId)!
  const bill = stayBill(stay, db.payments, now, property.settings)
  const services = db.services.filter((service) => service.propertyId === property.id)
  const payments = db.payments.filter((payment) => payment.stayId === stay.id)
  const openShiftId = openShiftOf(db, property.id)?.id
  // Chỉ đổi sang qua đêm được nếu giờ vào nằm trong khung nhận qua đêm.
  const rentOptions = RENT_TYPES.filter(
    (value) =>
      value !== stay.rentType &&
      (value !== 'overnight' || overnightAllowed(new Date(stay.checkInAt), property.settings)),
  )
  const elapsed = (now.getTime() - new Date(stay.checkInAt).getTime()) / MINUTE_MS
  const due = bill.charge.dueAt
  const unit = PERIOD_UNIT[stay.rentType]
  const toggle = (next: Mode) => setMode(mode === next ? null : next)

  // Máy chủ từ chối khi số tiền nó tính khác số đang hiện ở đây (vừa sang mốc giờ mới, hoặc máy
  // khác vừa thêm dịch vụ). Khi đó ở lại màn hình này: số tiền đã được tải lại, người trực xem
  // số mới rồi bấm lại.
  const [refused, setRefused] = useState('')
  const finish = async (method: PaymentMethod) => {
    const message = await checkOut(stay.id, method, bill.due)
    if (message) setRefused(message)
    else onClose()
  }

  return (
    <div className="space-y-4">
      <GuestEditor stay={stay} />

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
        <dt className="text-slate-500">Số người (tiêu chuẩn {stay.standardGuests})</dt>
        <dd className="flex items-center justify-end gap-2 text-slate-800">
          <button
            type="button"
            aria-label="Bớt một người"
            className="size-9 rounded-lg ring-1 ring-slate-300 active:bg-slate-100"
            onClick={() => setGuestCount(stay.id, stay.guestCount - 1)}
          >
            −
          </button>
          <span className="min-w-4 text-center">{stay.guestCount}</span>
          <button
            type="button"
            aria-label="Thêm một người"
            className="size-9 rounded-lg ring-1 ring-slate-300 active:bg-slate-100"
            onClick={() => setGuestCount(stay.id, stay.guestCount + 1)}
          >
            +
          </button>
        </dd>
        <dt className="text-slate-500">Kiểu thuê</dt>
        <dd className="text-right text-slate-800">{RENT_LABEL[stay.rentType]}</dd>
        <dt className="text-slate-500">Vào lúc</dt>
        <dd className="text-right text-slate-800">
          {time(stay.checkInAt)} {dayMonth(stay.checkInAt)} · đã ở {duration(elapsed)}
        </dd>
        {due && (
          <>
            <dt className="text-slate-500">Hạn trả</dt>
            <dd className="text-right text-slate-800">
              {time(due)} {dayMonth(due)}
            </dd>
          </>
        )}
      </dl>

      <StayPhotos stay={stay} canEdit />
      <StayNotes stay={stay} />

      <div className="rounded-xl bg-slate-50 p-3 text-sm">
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
        {stay.items.map((item) => (
          <div key={item.id} className="flex items-center justify-between py-1">
            <span>
              {item.kind === 'discount' && 'Giảm giá: '}
              {item.name}
              {item.qty > 1 && ` × ${item.qty}`}
              <button
                type="button"
                aria-label={`Bỏ ${item.name}`}
                className={removeButton}
                onClick={() => removeItem(stay.id, item.id)}
              >
                ✕
              </button>
            </span>
            <span>{money(itemAmount(item))}</span>
          </div>
        ))}
        {payments.map((payment) => (
          <div key={payment.id} className="flex items-center justify-between py-1 text-slate-500">
            <span>
              {payment.amount < 0 ? 'Đã hoàn' : 'Đã thu'} {time(payment.at)} ·{' '}
              {METHOD_LABEL[payment.method].toLowerCase()}
              {/* Khoản nhập nhầm chỉ bỏ được khi ca thu nó còn mở. */}
              {payment.shiftId === openShiftId && (
                <button
                  type="button"
                  aria-label={`Bỏ khoản thu ${money(payment.amount)}`}
                  className={removeButton}
                  onClick={() => removePayment(payment.id)}
                >
                  ✕
                </button>
              )}
            </span>
            <span>
              {payment.amount < 0 ? '+' : '−'}
              {money(Math.abs(payment.amount))}
            </span>
          </div>
        ))}
        <div className="mt-1 flex justify-between border-t border-slate-200 pt-2 text-base font-semibold text-slate-800">
          <span>{bill.due < 0 ? 'Phải hoàn lại' : 'Còn phải thu'}</span>
          <span>{money(Math.abs(bill.due))} đ</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={mode === 'service' ? btnPrimary : btn} onClick={() => toggle('service')}>
          Thêm dịch vụ
        </button>
        <button type="button" className={mode === 'surcharge' ? btnPrimary : btn} onClick={() => toggle('surcharge')}>
          Thêm phụ thu
        </button>
        <button type="button" className={mode === 'prepay' ? btnPrimary : btn} onClick={() => toggle('prepay')}>
          Thu trước
        </button>
        <button type="button" className={mode === 'rentType' ? btnPrimary : btn} onClick={() => toggle('rentType')}>
          Đổi kiểu thuê
        </button>
        <button
          type="button"
          className={`${mode === 'move' ? btnPrimary : btn} col-span-2`}
          onClick={() => toggle('move')}
        >
          Đổi phòng
        </button>
        {/* Giảm giá cũng là sửa giá, nên dùng chung quyền với việc sửa giá lúc nhận phòng. */}
        {canEditPrice && (
          <button
            type="button"
            className={`${mode === 'discount' ? btnPrimary : btn} col-span-2`}
            onClick={() => toggle('discount')}
          >
            Giảm giá
          </button>
        )}
        {unit && (
          <button type="button" className={`${btn} col-span-2`} onClick={() => extendStay(stay.id)}>
            Gia hạn thêm 1 {unit}
          </button>
        )}
      </div>

      {mode === 'service' && (
        <div className="grid grid-cols-2 gap-2">
          {services.map((service) => (
            <button
              key={service.id}
              type="button"
              className={btn}
              onClick={() => addItem(stay.id, 'service', service.name, service.price)}
            >
              {service.name} · {money(service.price)}
            </button>
          ))}
        </div>
      )}

      {mode === 'surcharge' && (
        <SurchargeForm
          placeholder="Làm hỏng đồ"
          action="Thêm phụ thu"
          onAdd={(name, amount) => {
            addItem(stay.id, 'surcharge', name, amount)
            setMode(null)
          }}
        />
      )}

      {mode === 'move' && (
        <div className="space-y-2">
          <p className="text-sm text-slate-600">
            Chọn phòng trống để chuyển khách sang. Giờ vào, giá và hóa đơn giữ nguyên; phòng này chuyển sang chờ dọn.
          </p>
          <RoomPicker
            stay={stay}
            onPick={(roomId) => {
              moveStay(stay.id, roomId)
              onClose()
            }}
          />
        </div>
      )}

      {mode === 'discount' && (
        <SurchargeForm
          placeholder="Khách quen"
          action="Giảm giá"
          onAdd={(name, amount) => {
            addItem(stay.id, 'discount', name, amount)
            setMode(null)
          }}
        />
      )}

      {mode === 'prepay' && (
        <PrepayForm
          onPay={(amount, method) => {
            addPayment(stay.id, amount, method)
            setMode(null)
          }}
        />
      )}

      {mode === 'rentType' && (
        <div className="grid grid-cols-2 gap-2">
          {rentOptions.map((value) => (
            <button
              key={value}
              type="button"
              className={btn}
              onClick={() => {
                changeRentType(stay.id, value)
                setMode(null)
              }}
            >
              {RENT_LABEL[value]}
            </button>
          ))}
        </div>
      )}

      {mode === 'checkout' ? (
        <div className="space-y-2 rounded-xl bg-slate-50 p-3">
          <p className="text-sm text-slate-600">
            {bill.due > 0 && `Thu ${money(bill.due)} đ rồi chọn hình thức đã nhận.`}
            {bill.due < 0 && `Hoàn ${money(-bill.due)} đ cho khách rồi chọn hình thức đã hoàn.`}
            {bill.due === 0 && 'Khách đã trả đủ.'}
          </p>
          {/* Mã QR là tùy chọn: cơ sở không cài tài khoản thì chỉ ghi nhận hình thức đã thu. */}
          {bill.due > 0 && property.bank && (
            <TransferQr
              bank={property.bank}
              amount={bill.due}
              content={`P${room.number} ${stay.id.replace(/[^a-z0-9]/gi, '').slice(-4).toUpperCase()}`}
            />
          )}
          {bill.due === 0 ? (
            <button
              type="button"
              className={`${btnPrimary} w-full py-3`}
              onClick={() => finish('cash')}
            >
              Trả phòng
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {METHODS.map((method) => (
                <button
                  key={method}
                  type="button"
                  className={`${btnPrimary} py-3`}
                  onClick={() => finish(method)}
                >
                  {METHOD_LABEL[method]}
                </button>
              ))}
            </div>
          )}
          {refused && (
            <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-800 ring-1 ring-amber-200" role="alert">
              {refused}
            </p>
          )}
          <button type="button" className={linkButton} onClick={() => setMode(null)}>
            Quay lại
          </button>
        </div>
      ) : (
        <button type="button" className={`${btnPrimary} w-full py-3`} onClick={() => setMode('checkout')}>
          Thanh toán và trả phòng
        </button>
      )}
    </div>
  )
}

// Mã VietQR có sẵn số tiền và nội dung, để khách quét bằng ứng dụng ngân hàng.
function TransferQr({ bank, amount, content }: { bank: BankAccount; amount: number; content: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-white p-3 ring-1 ring-slate-200">
      <QRCodeSVG
        value={buildVietQr({ bin: bank.bin, accountNumber: bank.accountNumber, amount, content })}
        size={128}
        role="img"
        aria-label={`Mã QR chuyển khoản ${money(amount)} đồng`}
      />
      <div className="min-w-0 text-xs text-slate-600">
        <p className="font-medium text-slate-800">Quét để chuyển khoản</p>
        <p>{bankName(bank.bin)}</p>
        <p className="truncate">{bank.accountName}</p>
        <p>Số tiền: {money(amount)} đ</p>
        <p>Nội dung: {content}</p>
      </div>
    </div>
  )
}

interface SurchargeFormProps {
  placeholder: string
  action: string
  onAdd: (name: string, amount: number) => void
}

// Một dòng lý do kèm số tiền. Dùng cho cả phụ thu lẫn giảm giá.
function SurchargeForm({ placeholder, action, onAdd }: SurchargeFormProps) {
  const [name, setName] = useState('')
  const [amount, setAmount] = useState(0)
  const [error, setError] = useState(false)

  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault()
        if (!name.trim() || amount <= 0) {
          setError(true)
          return
        }
        onAdd(name.trim(), amount)
      }}
    >
      <div className="grid grid-cols-2 gap-2">
        <input
          className={input}
          placeholder={placeholder}
          aria-label="Lý do"
          value={name}
          onChange={(event) => {
            setName(event.target.value)
            setError(false)
          }}
        />
        <MoneyInput
          ariaLabel="Số tiền"
          value={amount}
          onChange={(value) => {
            setAmount(value)
            setError(false)
          }}
        />
      </div>
      {error && <p className="text-sm text-red-600">Nhập lý do và số tiền.</p>}
      <button type="submit" className={`${btn} w-full`}>
        {action}
      </button>
    </form>
  )
}

function PrepayForm({ onPay }: { onPay: (amount: number, method: PaymentMethod) => void }) {
  const [amount, setAmount] = useState(0)
  const [error, setError] = useState(false)

  return (
    <div className="space-y-2">
      <MoneyInput
        ariaLabel="Số tiền thu trước"
        value={amount}
        onChange={(value) => {
          setAmount(value)
          setError(false)
        }}
      />
      {error && <p className="text-sm text-red-600">Nhập số tiền thu trước.</p>}
      <div className="grid grid-cols-2 gap-2">
        {METHODS.map((method) => (
          <button
            key={method}
            type="button"
            className={btn}
            onClick={() => (amount > 0 ? onPay(amount, method) : setError(true))}
          >
            Đã thu {METHOD_LABEL[method].toLowerCase()}
          </button>
        ))}
      </div>
    </div>
  )
}
