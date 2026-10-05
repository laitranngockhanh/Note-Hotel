import { useState } from 'react'
import { addProperty, deleteProperty, renameProperty, setPropertyActive, useDb } from '../api'
import { btn, btnPrimary, input } from '../components/ui'
import type { Property } from '../types'

const card = 'rounded-xl bg-white p-4 ring-1 ring-slate-200'
const cardTitle = 'mb-3 text-sm font-semibold text-slate-800'

interface Message {
  text: string
  failed: boolean
}

interface Props {
  currentPropertyId: string
}

// Danh sách mọi cơ sở, kể cả đã ngừng. Sơ đồ, giá và dịch vụ của từng cơ sở thì sửa
// sau khi chuyển sang cơ sở đó.
export default function PropertySettings({ currentPropertyId }: Props) {
  const db = useDb()
  const [name, setName] = useState('')
  const [message, setMessage] = useState<Message | null>(null)

  return (
    <div className="space-y-4">
      <section className={card}>
        <h2 className={cardTitle}>Các cơ sở</h2>
        <p className="mb-3 text-xs text-slate-500">
          Cơ sở ngừng hoạt động sẽ không còn ở màn chọn cơ sở, nhưng lịch sử và báo cáo vẫn giữ nguyên.
        </p>
        <div className="space-y-3">
          {db.properties.map((property) => (
            <PropertyRow key={property.id} property={property} isCurrent={property.id === currentPropertyId} />
          ))}
        </div>
      </section>

      <form
        className={card}
        onSubmit={async (event) => {
          event.preventDefault()
          if (!name.trim()) return setMessage({ text: 'Nhập tên cơ sở.', failed: true })
          // Thêm không được thì lỗi hiện ở thanh thông báo chung.
          if (!(await addProperty(name.trim(), currentPropertyId))) return
          setMessage({ text: `Đã thêm ${name.trim()}. Chuyển sang cơ sở đó để dựng sơ đồ phòng.`, failed: false })
          setName('')
        }}
      >
        <h2 className={cardTitle}>Thêm cơ sở</h2>
        <input
          className={input}
          placeholder="Nhà nghỉ Sao Mai"
          aria-label="Tên cơ sở mới"
          value={name}
          onChange={(event) => {
            setName(event.target.value)
            setMessage(null)
          }}
        />
        <p className="mt-2 text-xs text-slate-500">
          Loại phòng, bảng giá và dịch vụ được chép từ cơ sở đang mở. Sơ đồ phòng bắt đầu trống.
        </p>
        {message && (
          <p className={`mt-2 text-sm ${message.failed ? 'text-red-600' : 'text-emerald-600'}`}>{message.text}</p>
        )}
        <button type="submit" className={`${btnPrimary} mt-3 w-full`}>
          Thêm cơ sở
        </button>
      </form>
    </div>
  )
}

function PropertyRow({ property, isCurrent }: { property: Property; isCurrent: boolean }) {
  const [name, setName] = useState(property.name)
  const [message, setMessage] = useState<Message | null>(null)

  const run = (error: string | null, done: string) => setMessage({ text: error ?? done, failed: error !== null })

  return (
    <form
      className="rounded-lg p-3 ring-1 ring-slate-200"
      onSubmit={async (event) => {
        event.preventDefault()
        if (!name.trim()) return run('Nhập tên cơ sở.', '')
        run(await renameProperty(property.id, name.trim()), 'Đã lưu.')
      }}
    >
      <p className="mb-2 text-xs text-slate-500">
        {property.active ? 'Đang hoạt động' : 'Đã ngừng'}
        {isCurrent && ' · Đang mở'}
      </p>
      <div className="flex gap-2">
        <input
          className={input}
          aria-label={`Tên của ${property.name}`}
          value={name}
          onChange={(event) => {
            setName(event.target.value)
            setMessage(null)
          }}
        />
        <button type="submit" className={`${btnPrimary} shrink-0`}>
          Lưu
        </button>
      </div>
      {message && (
        <p className={`mt-2 text-sm ${message.failed ? 'text-red-600' : 'text-emerald-600'}`}>{message.text}</p>
      )}
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          className={`${btn} text-red-600`}
          onClick={async () => run(await deleteProperty(property.id), 'Đã xóa.')}
        >
          Xóa
        </button>
        <button
          type="button"
          className={btn}
          onClick={async () =>
            run(
              await setPropertyActive(property.id, !property.active),
              property.active ? 'Đã ngừng hoạt động.' : 'Đã mở lại.',
            )
          }
        >
          {property.active ? 'Ngừng hoạt động' : 'Mở lại'}
        </button>
      </div>
    </form>
  )
}
