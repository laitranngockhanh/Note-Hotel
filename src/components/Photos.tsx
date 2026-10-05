import { useEffect, useRef, useState, type ReactNode } from 'react'
import { MAX_STAY_PHOTOS, attachPhoto, getPhoto, preparePhoto, removePhoto } from '../api'
import type { Stay } from '../types'
import Modal from './Modal'
import { btn } from './ui'

// Ảnh giấy tờ của khách. Một ô chọn file dùng cho cả hai trường hợp: trên điện thoại nó
// cho chụp hoặc lấy ảnh trong máy, trên máy tính nó mở thư mục để chọn file.

const thumb = 'size-20 rounded-lg object-cover ring-1 ring-slate-200'

// Đường dẫn tạm của một ảnh, tự thu hồi khi không dùng nữa.
function useObjectUrl(blob: Blob | null): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!blob) {
      setUrl(null)
      return
    }
    const next = URL.createObjectURL(blob)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [blob])
  return url
}

function useStoredPhoto(photoId: string): Blob | null {
  const [blob, setBlob] = useState<Blob | null>(null)
  useEffect(() => {
    let cancelled = false
    getPhoto(photoId)
      .then((found) => {
        if (!cancelled) setBlob(found)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [photoId])
  return blob
}

interface TileProps {
  blob: Blob | null
  label: string
  onOpen: (blob: Blob) => void
  onRemove?: () => void
}

function PhotoTile({ blob, label, onOpen, onRemove }: TileProps) {
  const url = useObjectUrl(blob)
  return (
    <div className="relative">
      {url && blob ? (
        <button type="button" onClick={() => onOpen(blob)} aria-label={`Xem ${label}`}>
          <img src={url} alt={label} className={thumb} />
        </button>
      ) : (
        <div className={`${thumb} bg-slate-100`} role="img" aria-label={`${label} đang tải`} />
      )}
      {onRemove && (
        <button
          type="button"
          aria-label={`Bỏ ${label}`}
          className="absolute -top-2 -right-2 size-8 rounded-full bg-white text-xs text-slate-600 shadow ring-1 ring-slate-300"
          onClick={onRemove}
        >
          ✕
        </button>
      )}
    </div>
  )
}

function StoredTile({ photoId, ...rest }: Omit<TileProps, 'blob'> & { photoId: string }) {
  return <PhotoTile blob={useStoredPhoto(photoId)} {...rest} />
}

function Viewer({ blob, onClose }: { blob: Blob; onClose: () => void }) {
  const url = useObjectUrl(blob)
  return (
    <Modal title="Ảnh giấy tờ" onClose={onClose}>
      {url && <img src={url} alt="Ảnh giấy tờ của khách" className="w-full rounded-lg" />}
    </Modal>
  )
}

interface PickerProps {
  count: number
  onPick: (blobs: Blob[]) => void
}

// Nút thêm ảnh: kiểm tra và thu nhỏ ảnh ngay khi chọn, báo lỗi tại chỗ nếu ảnh hỏng.
function Picker({ count, onPick }: PickerProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const room = MAX_STAY_PHOTOS - count

  const handle = async (files: File[]) => {
    setError('')
    setBusy(true)
    const blobs: Blob[] = []
    const errors: string[] = []
    if (files.length > room) errors.push(`Mỗi lượt thuê tối đa ${MAX_STAY_PHOTOS} ảnh.`)
    for (const file of files.slice(0, room)) {
      const result = await preparePhoto(file)
      if ('blob' in result) blobs.push(result.blob)
      else errors.push(result.error)
    }
    setBusy(false)
    setError(errors.join(' '))
    if (blobs.length > 0) onPick(blobs)
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        aria-label="Chọn ảnh giấy tờ"
        onChange={(event) => {
          const files = [...(event.target.files ?? [])]
          // Xóa giá trị để chọn lại đúng file vừa bỏ vẫn kích hoạt được sự kiện.
          event.target.value = ''
          void handle(files)
        }}
      />
      {room > 0 && (
        <button type="button" className={btn} onClick={() => inputRef.current?.click()}>
          {busy ? 'Đang xử lý ảnh…' : 'Thêm ảnh giấy tờ'}
        </button>
      )}
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  )
}

function Layout({ children, picker }: { children: ReactNode; picker?: ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-slate-500">Ảnh giấy tờ (giữ đến khi trả phòng)</p>
      <div className="flex flex-wrap gap-3">{children}</div>
      {picker}
    </div>
  )
}

// Ảnh đã chọn trong form nhận phòng hoặc đặt trước, khi lượt thuê chưa được tạo.
export function PendingPhotos({ blobs, onChange }: { blobs: Blob[]; onChange: (blobs: Blob[]) => void }) {
  const [viewing, setViewing] = useState<Blob | null>(null)
  return (
    <Layout picker={<Picker count={blobs.length} onPick={(added) => onChange([...blobs, ...added])} />}>
      {blobs.map((blob, index) => (
        <PhotoTile
          key={index}
          blob={blob}
          label={`ảnh ${index + 1}`}
          onOpen={setViewing}
          onRemove={() => onChange(blobs.filter((_, i) => i !== index))}
        />
      ))}
      {viewing && <Viewer blob={viewing} onClose={() => setViewing(null)} />}
    </Layout>
  )
}

// Ảnh của một lượt thuê đã có. canEdit là false thì chỉ xem.
export function StayPhotos({ stay, canEdit }: { stay: Stay; canEdit: boolean }) {
  const [viewing, setViewing] = useState<Blob | null>(null)
  if (!canEdit && stay.photos.length === 0) return null

  return (
    <Layout
      picker={
        canEdit && (
          <Picker
            count={stay.photos.length}
            onPick={async (blobs) => {
              for (const blob of blobs) await attachPhoto(stay.id, blob)
            }}
          />
        )
      }
    >
      {stay.photos.map((photo, index) => (
        <StoredTile
          key={photo.id}
          photoId={photo.id}
          label={`ảnh ${index + 1}`}
          onOpen={setViewing}
          onRemove={canEdit ? () => void removePhoto(stay.id, photo.id) : undefined}
        />
      ))}
      {viewing && <Viewer blob={viewing} onClose={() => setViewing(null)} />}
    </Layout>
  )
}

// Gắn các ảnh đã chọn trong form vào lượt thuê vừa tạo.
export async function attachAll(stayId: string, blobs: Blob[]): Promise<void> {
  for (const blob of blobs) await attachPhoto(stayId, blob)
}
