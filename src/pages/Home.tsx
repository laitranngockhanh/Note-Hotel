import { useState } from 'react'
import { openShiftOf, serverNow, startShift, useDb } from '../api'
import { btn, btnPrimary } from '../components/ui'
import { useNow } from '../hooks/useNow'
import { dateKey, dayMonth, parseDateKey, time } from '../lib/format'
import type { Property, Session } from '../types'
import EndShift from './EndShift'
import Manage from './Manage'
import Report from './Report'
import RoomMap from './RoomMap'
import RoomSheet from './RoomSheet'
import Stays from './Stays'

// Một ca bình thường dài khoảng 12 tiếng; quá mức này nhiều khả năng là quên kết thúc ca.
const MAX_SHIFT_HOURS = 16

type View = 'map' | 'stays' | 'report' | 'manage'

// Người trực chỉ thấy hai mục đầu. Giữ tối đa bốn mục để vừa một hàng trên điện thoại.
const VIEWS: { view: View; label: string; ownerOnly?: boolean }[] = [
  { view: 'map', label: 'Sơ đồ phòng' },
  { view: 'stays', label: 'Lượt thuê' },
  { view: 'report', label: 'Báo cáo', ownerOnly: true },
  { view: 'manage', label: 'Quản lý', ownerOnly: true },
]

interface Props {
  session: Session
  property: Property
  onSwitchProperty: () => void
  onLogout: () => void
}

export default function Home({ session, property, onSwitchProperty, onLogout }: Props) {
  const db = useDb()
  const [view, setView] = useState<View>('map')
  const [roomId, setRoomId] = useState<string | null>(null)
  const [ending, setEnding] = useState(false)
  const now = useNow()

  const shift = openShiftOf(db, property.id)
  const isOwner = session.role === 'owner'
  // Ca mở quá lâu thì tiền của ngày hôm sau vẫn bị tính cho ngày mở ca.
  const shiftTooLong =
    shift !== null && now.getTime() - new Date(shift.openedAt).getTime() > MAX_SHIFT_HOURS * 60 * 60 * 1000

  if (!shift && !isOwner) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-slate-50 px-4">
        <p className="text-sm text-slate-600">{property.name} chưa có ca nào đang mở.</p>
        <button type="button" className={`${btnPrimary} px-6 py-3`} onClick={() => startShift(property.id)}>
          Bắt đầu ca của {session.name}
        </button>
      </main>
    )
  }

  // Người trực khác vào khi ca trước chưa kết thúc: phải đóng ca đó rồi mới mở ca mới.
  // Chủ thì vào xem được mà không ảnh hưởng ca đang mở.
  const takeover = shift !== null && shift.userId !== session.userId && !isOwner
  const ownShift = shift?.userId === session.userId

  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2">
          <div className="min-w-0">
            {isOwner ? (
              <button
                type="button"
                className="block max-w-full truncate text-sm font-semibold text-slate-800 underline decoration-dotted"
                onClick={onSwitchProperty}
              >
                {property.name}
              </button>
            ) : (
              <p className="truncate text-sm font-semibold text-slate-800">{property.name}</p>
            )}
            <p className="truncate text-xs text-slate-500">
              {session.name} · {isOwner ? 'Chủ' : 'Người trực'}
              {shift && ` · Ca ${shift.label.toLowerCase()}${ownShift ? '' : ` của ${shift.userName}`}`}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            {shift && (
              <button type="button" className={btn} onClick={() => setEnding(true)}>
                Kết thúc ca
              </button>
            )}
            <button type="button" className={btn} onClick={onLogout}>
              Khóa
            </button>
          </div>
        </div>
        <nav className="mx-auto mt-3 flex max-w-3xl gap-1.5">
          {VIEWS.filter((item) => isOwner || !item.ownerOnly).map((item) => (
            <button
              key={item.view}
              type="button"
              aria-pressed={view === item.view}
              className={`${view === item.view ? btnPrimary : btn} flex-1 px-1! whitespace-nowrap`}
              onClick={() => setView(item.view)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-4">
        {!shift && view === 'map' && (
          <p className="mb-4 rounded-xl bg-slate-100 p-3 text-sm text-slate-600">
            Chưa có ca nào đang mở. Ca của bạn sẽ tự mở khi bạn nhận phòng hoặc thu tiền.
          </p>
        )}

        {shift && shiftTooLong && !takeover && (
          <div
            className="mb-4 flex items-center justify-between gap-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800 ring-1 ring-amber-200"
            role="alert"
          >
            <span>
              Ca của {shift.userName} mở từ {time(shift.openedAt)} {dayMonth(shift.openedAt)}, đã quá {MAX_SHIFT_HOURS}{' '}
              tiếng. Tiền thu lúc này vẫn tính cho ngày {dayMonth(parseDateKey(shift.businessDate))}. Kết thúc ca rồi mở ca
              mới để báo cáo đúng ngày.
            </span>
            <button type="button" className={`${btnPrimary} shrink-0`} onClick={() => setEnding(true)}>
              Kết thúc ca
            </button>
          </div>
        )}

        {view === 'report' && isOwner ? (
          <Report property={property} initialDate={shift?.businessDate ?? dateKey(serverNow())} />
        ) : view === 'manage' && isOwner ? (
          <Manage property={property} currentUserId={session.userId} />
        ) : view === 'stays' ? (
          <Stays propertyId={property.id} />
        ) : (
          <RoomMap propertyId={property.id} onSelect={setRoomId} />
        )}
      </main>

      {roomId && !takeover && (
        <RoomSheet
          roomId={roomId}
          canEditPrice={isOwner || property.staffCanEditPrice}
          onClose={() => setRoomId(null)}
        />
      )}

      {shift && takeover && (
        <EndShift
          shift={shift}
          title={`Ca của ${shift.userName} chưa kết thúc`}
          onDone={() => void startShift(property.id)}
        />
      )}

      {shift && !takeover && ending && (
        <EndShift
          shift={shift}
          title="Kết thúc ca"
          onCancel={() => setEnding(false)}
          onDone={() => {
            setEnding(false)
            if (ownShift && !isOwner) onLogout()
          }}
        />
      )}
    </div>
  )
}
