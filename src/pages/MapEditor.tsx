import { Fragment, useState } from 'react'
import { addRoom, deleteRoom, moveRoom, updateRoom, useDb, type RoomPosition } from '../api'
import Modal from '../components/Modal'
import { btn, btnPrimary, fieldLabel, floorBody, floorColumns, floorScroll, input } from '../components/ui'
import type { Room, RoomType } from '../types'

// Mỗi tầng tối đa 4 dãy, mỗi dãy 12 phòng. Dãy dài hơn bề ngang màn hình thì kéo ngang để xem.
const MAX_ROWS = 4
const MAX_COLS = 12
const MIN_COLS = 4

interface FormTarget extends RoomPosition {
  room?: Room
}

interface Props {
  propertyId: string
}

// Sửa sơ đồ bằng cách bấm, không kéo thả: bấm ô trống để thêm phòng, bấm phòng để
// sửa, chuyển chỗ hoặc xóa. Mỗi tầng luôn chừa sẵn một hàng và một cột trống để mở rộng.
export default function MapEditor({ propertyId }: Props) {
  const db = useDb()
  const rooms = db.rooms.filter((room) => room.propertyId === propertyId)
  const types = db.roomTypes.filter((type) => type.propertyId === propertyId)
  const [extraFloors, setExtraFloors] = useState<number[]>([])
  const [movingId, setMovingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormTarget | null>(null)

  const floors = [...new Set([...rooms.map((room) => room.floor), ...extraFloors])].sort((a, b) => b - a)
  const nextFloor = (floors[0] ?? 0) + 1
  const moving = rooms.find((room) => room.id === movingId)

  const onCell = (position: RoomPosition, room?: Room) => {
    if (movingId) {
      if (!room) moveRoom(movingId, position)
      setMovingId(null)
      return
    }
    setForm({ ...position, room })
  }

  // Phòng nào cũng phải thuộc một loại phòng (để có giá), nên chưa có loại phòng thì chưa thêm được.
  if (types.length === 0) {
    return (
      <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800 ring-1 ring-amber-200">
        Cơ sở này chưa có loại phòng nào. Sang mục Cài đặt, bấm “Thêm loại phòng” và nhập giá trước, rồi quay lại
        đây để thêm phòng.
      </p>
    )
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600">
        {moving
          ? `Đang chuyển phòng ${moving.number}. Bấm vào một ô trống để đặt, hoặc bấm một phòng bất kỳ để hủy.`
          : 'Bấm ô trống để thêm phòng. Bấm một phòng để sửa, chuyển chỗ hoặc xóa.'}
      </p>
      {!moving && (
        <p className="text-xs text-slate-500">
          Cuối mỗi dãy luôn có sẵn một ô trống: thêm phòng vào đó thì dãy tự dài thêm, tối đa {MAX_COLS} phòng một
          dãy và {MAX_ROWS} dãy một tầng. Dãy dài quá màn hình thì kéo ngang để xem.
        </p>
      )}

      <button type="button" className={btn} onClick={() => setExtraFloors([...extraFloors, nextFloor])}>
        Thêm tầng {nextFloor}
      </button>

      {floors.map((floor) => {
        const floorRooms = rooms.filter((room) => room.floor === floor)
        const rowCount = Math.min(Math.max(0, ...floorRooms.map((room) => room.row)) + 1, MAX_ROWS)
        const colCount = Math.min(
          Math.max(MIN_COLS, Math.max(0, ...floorRooms.map((room) => room.col)) + 1),
          MAX_COLS,
        )
        return (
          <section key={floor}>
            <h2 className="mb-2 text-sm font-medium text-slate-500">Tầng {floor}</h2>
            <div className={floorScroll}>
              <div className={floorBody}>
                {Array.from({ length: rowCount }, (_, rowIndex) => rowIndex + 1).map((row) => (
                  <Fragment key={row}>
                    {row > 1 && (
                      <div className="my-2 border-y border-dashed border-slate-300 py-1 text-center text-xs text-slate-400">
                        Hành lang
                      </div>
                    )}
                    <div className="grid gap-2" style={{ gridTemplateColumns: floorColumns(colCount) }}>
                      {Array.from({ length: colCount }, (_, colIndex) => colIndex + 1).map((col) => {
                        const room = floorRooms.find((r) => r.row === row && r.col === col)
                        const position = { floor, row, col }
                        return room ? (
                          <button
                            key={col}
                            type="button"
                            onClick={() => onCell(position, room)}
                            className={`flex min-h-16 flex-col items-start rounded-xl p-2 text-left ring-1 ${
                              room.id === movingId
                                ? 'bg-slate-800 text-white ring-slate-800'
                                : 'bg-white text-slate-800 ring-slate-300'
                            }`}
                          >
                            <span className="text-base font-semibold">{room.number}</span>
                            <span className="text-xs opacity-70">
                              {types.find((type) => type.id === room.typeId)?.name}
                            </span>
                          </button>
                        ) : (
                          <button
                            key={col}
                            type="button"
                            aria-label={`Ô trống tầng ${floor}, hàng ${row}, cột ${col}`}
                            onClick={() => onCell(position)}
                            className="min-h-16 rounded-xl border border-dashed border-slate-300 text-lg text-slate-400 active:bg-slate-100"
                          >
                            {movingId ? '↓' : '+'}
                          </button>
                        )
                      })}
                    </div>
                  </Fragment>
                ))}
              </div>
            </div>
          </section>
        )
      })}

      {floors.length === 0 && <p className="text-sm text-slate-500">Chưa có tầng nào. Thêm tầng 1 để bắt đầu.</p>}

      {form && (
        <RoomForm
          propertyId={propertyId}
          target={form}
          rooms={rooms}
          types={types}
          onMove={(roomId) => {
            setMovingId(roomId)
            setForm(null)
          }}
          onClose={() => setForm(null)}
        />
      )}
    </div>
  )
}

interface FormProps {
  propertyId: string
  target: FormTarget
  rooms: Room[]
  types: RoomType[]
  onMove: (roomId: string) => void
  onClose: () => void
}

function RoomForm({ propertyId, target, rooms, types, onMove, onClose }: FormProps) {
  const { room, floor, row, col } = target
  const onFloor = rooms.filter((r) => r.floor === floor).length
  const [number, setNumber] = useState(room?.number ?? String(floor * 100 + onFloor + 1))
  const [typeId, setTypeId] = useState(room?.typeId ?? types[0]?.id ?? '')
  const [error, setError] = useState('')

  const save = () => {
    const value = number.trim()
    if (!value) return setError('Nhập số phòng.')
    if (rooms.some((r) => r.number === value && r.id !== room?.id)) return setError('Số phòng này đã có.')
    if (room) updateRoom(room.id, value, typeId)
    else addRoom(propertyId, value, typeId, { floor, row, col })
    onClose()
  }

  return (
    <Modal
      title={room ? `Sửa phòng ${room.number}` : 'Thêm phòng'}
      subtitle={`Tầng ${floor} · hàng ${row} · cột ${col}`}
      onClose={onClose}
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault()
          save()
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className={fieldLabel}>Số phòng</span>
            <input
              className={input}
              value={number}
              onChange={(event) => {
                setNumber(event.target.value)
                setError('')
              }}
            />
          </label>
          <label>
            <span className={fieldLabel}>Loại phòng</span>
            <select className={input} value={typeId} onChange={(event) => setTypeId(event.target.value)}>
              {types.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button type="submit" className={`${btnPrimary} w-full py-3`}>
          {room ? 'Lưu' : 'Thêm phòng'}
        </button>

        {room && (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={btn} onClick={() => onMove(room.id)}>
              Chuyển chỗ
            </button>
            <button
              type="button"
              className={`${btn} text-red-600`}
              onClick={async () => {
                // Máy chủ từ chối nếu phòng đã có lượt thuê, và trả về câu giải thích.
                const refused = await deleteRoom(room.id)
                if (refused) setError(refused)
                else onClose()
              }}
            >
              Xóa phòng
            </button>
          </div>
        )}
      </form>
    </Modal>
  )
}
