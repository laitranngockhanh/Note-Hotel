import { useCallback, useEffect, useRef, useState } from 'react'
import { PIN_LENGTH, login } from '../api'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

interface Props {
  propertyId: string
  propertyName: string
  onChangeProperty?: () => void
}

export default function LoginPin({ propertyId, propertyName, onChangeProperty }: Props) {
  const [pin, setPin] = useState('')
  // Câu báo của máy chủ: sai PIN và số lần còn lại, đang bị khóa, hoặc chưa được phân công.
  const [message, setMessage] = useState('')
  const [checking, setChecking] = useState(false)

  // Giữ PIN trong ref để việc gửi PIN xảy ra đúng một lần cho mỗi lần nhập đủ số, không phụ
  // thuộc số lần component vẽ lại.
  const pinRef = useRef('')
  const busyRef = useRef(false)

  const update = useCallback((value: string) => {
    pinRef.current = value
    setPin(value)
  }, [])

  const pressDigit = useCallback(
    (digit: string) => {
      if (busyRef.current || pinRef.current.length >= PIN_LENGTH) return
      setMessage('')
      const next = pinRef.current + digit
      update(next)
      if (next.length < PIN_LENGTH) return

      busyRef.current = true
      setChecking(true)
      void login(next, propertyId).then((error) => {
        busyRef.current = false
        setChecking(false)
        // Đăng nhập được thì màn hình này tự biến mất; chỉ cần xử lý khi bị từ chối.
        if (error) {
          setMessage(error)
          update('')
        }
      })
    },
    [update, propertyId],
  )

  const pressBackspace = useCallback(() => {
    if (busyRef.current) return
    setMessage('')
    update(pinRef.current.slice(0, -1))
  }, [update])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (/^\d$/.test(event.key)) pressDigit(event.key)
      else if (event.key === 'Backspace') pressBackspace()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [pressDigit, pressBackspace])

  const failed = message !== ''
  const keyClass =
    'h-16 rounded-2xl bg-white text-2xl font-medium text-slate-800 shadow-sm ring-1 ring-slate-200 transition active:scale-95 active:bg-slate-100'

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-slate-50 px-4 py-8">
      <div className="w-full max-w-xs">
        <h1 className="text-center text-xl font-semibold text-slate-800">{propertyName}</h1>
        <p className="mt-1 text-center text-sm text-slate-500">
          {checking ? 'Đang kiểm tra…' : 'Nhập mã PIN để bắt đầu ca'}
        </p>

        <div
          key={failed ? 'failed' : 'ok'}
          className={`mt-8 flex justify-center gap-4 ${failed ? 'animate-shake' : ''}`}
          aria-label={`Đã nhập ${pin.length} trên ${PIN_LENGTH} số`}
        >
          {Array.from({ length: PIN_LENGTH }, (_, i) => (
            <span
              key={i}
              className={`size-4 rounded-full ring-2 ${
                failed ? 'ring-red-400' : i < pin.length ? 'bg-slate-800 ring-slate-800' : 'ring-slate-300'
              }`}
            />
          ))}
        </div>

        <p className="mt-3 min-h-5 text-center text-sm text-red-600" role="alert">
          {message}
        </p>

        <div className="mt-4 grid grid-cols-3 gap-3">
          {KEYS.map((digit) => (
            <button key={digit} type="button" className={keyClass} onClick={() => pressDigit(digit)}>
              {digit}
            </button>
          ))}
          <span />
          <button type="button" className={keyClass} onClick={() => pressDigit('0')}>
            0
          </button>
          <button
            type="button"
            className="h-16 rounded-2xl text-base font-medium text-slate-600 transition active:scale-95 active:bg-slate-200"
            onClick={pressBackspace}
            aria-label="Xóa một số"
          >
            Xóa
          </button>
        </div>

        {onChangeProperty && (
          <button
            type="button"
            className="mt-6 block w-full py-2 text-center text-sm text-slate-500 underline"
            onClick={onChangeProperty}
          >
            Đổi cơ sở
          </button>
        )}
      </div>
    </main>
  )
}
