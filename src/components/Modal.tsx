import type { ReactNode } from 'react'

interface Props {
  title: string
  subtitle?: string
  onClose?: () => void
  children: ReactNode
}

// Trượt lên từ dưới trên điện thoại, nằm giữa trên màn hình lớn.
export default function Modal({ title, subtitle, onClose, children }: Props) {
  return (
    <div
      className="fixed inset-0 z-10 flex items-end justify-center bg-slate-900/40 sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-4 sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
            {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng"
              className="-mr-2 rounded-lg px-3 py-2 text-slate-500 active:bg-slate-100"
            >
              ✕
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  )
}
