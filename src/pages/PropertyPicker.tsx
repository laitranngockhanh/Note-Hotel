import { useState } from 'react'
import { addProperty, type PropertyName } from '../api'
import { btn, input } from '../components/ui'

interface Props {
  names: PropertyName[]
  // Chỉ chủ đã đăng nhập mới thêm được cơ sở.
  canAdd: boolean
  currentId?: string
  onPick: (propertyId: string) => void
  onBack?: () => void
}

export default function PropertyPicker({ names, canAdd, currentId, onPick, onBack }: Props) {
  const [name, setName] = useState('')
  const [error, setError] = useState(false)
  const [adding, setAdding] = useState(false)

  return (
    <main className="flex min-h-dvh flex-col items-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <h1 className="text-center text-xl font-semibold text-slate-800">Chọn cơ sở</h1>
        <p className="mt-1 text-center text-sm text-slate-500">Máy này sẽ nhớ cơ sở đã chọn</p>

        <div className="mt-6 space-y-3">
          {names.map((property) => (
            <button
              key={property.id}
              type="button"
              onClick={() => onPick(property.id)}
              className="w-full rounded-2xl bg-white p-4 text-left shadow-sm ring-1 ring-slate-200 transition active:scale-[0.98] active:bg-slate-100"
            >
              <span className="block text-base font-semibold text-slate-800">{property.name}</span>
              {property.id === currentId && <span className="block text-sm text-slate-500">Đang mở</span>}
            </button>
          ))}
          {names.length === 0 && (
            <p className="text-center text-sm text-slate-500">Chưa có cơ sở nào đang hoạt động.</p>
          )}
        </div>

        {canAdd && (
          <form
            className="mt-8 space-y-2 border-t border-slate-200 pt-6"
            onSubmit={async (event) => {
              event.preventDefault()
              if (!name.trim()) {
                setError(true)
                return
              }
              setAdding(true)
              const created = await addProperty(name.trim(), currentId)
              setAdding(false)
              if (created) onPick(created)
            }}
          >
            <label>
              <span className="mb-1 block text-xs font-medium text-slate-500">Thêm cơ sở mới</span>
              <input
                className={input}
                placeholder="Nhà nghỉ Sao Mai"
                value={name}
                onChange={(event) => {
                  setName(event.target.value)
                  setError(false)
                }}
              />
            </label>
            {error && <p className="text-sm text-red-600">Nhập tên cơ sở.</p>}
            <p className="text-xs text-slate-500">
              Loại phòng, bảng giá, dịch vụ và quy tắc tính tiền được chép từ cơ sở đang mở. Sơ đồ phòng bắt đầu trống.
            </p>
            <button type="submit" className={`${btn} w-full`}>
              {adding ? 'Đang thêm…' : 'Thêm cơ sở'}
            </button>
          </form>
        )}

        {onBack && (
          <button type="button" className="mt-6 block w-full py-2 text-center text-sm text-slate-500 underline" onClick={onBack}>
            Quay lại
          </button>
        )}
      </div>
    </main>
  )
}
