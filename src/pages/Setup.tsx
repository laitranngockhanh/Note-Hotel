import { useState } from 'react'
import { PIN_LENGTH, setupOwner } from '../api'
import { btnPrimary, fieldLabel, input } from '../components/ui'

interface Props {
  // Máy chủ có đặt mã cài đặt thì phải nhập đúng mã mới tạo được chủ.
  codeRequired: boolean
}

const onlyDigits = (value: string) => value.replace(/\D/g, '').slice(0, PIN_LENGTH)

// Màn hình của lần mở đầu tiên, khi hệ thống chưa có tài khoản nào: chủ sở hữu tự đặt tên,
// mã PIN và nhà nghỉ đầu tiên. Xong bước này thì màn hình không bao giờ hiện lại.
export default function Setup({ codeRequired }: Props) {
  const [ownerName, setOwnerName] = useState('')
  const [propertyName, setPropertyName] = useState('')
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const change = (setter: (value: string) => void) => (value: string) => {
    setter(value)
    setError('')
  }

  const submit = async () => {
    if (!ownerName.trim()) return setError('Nhập tên của bạn.')
    if (!propertyName.trim()) return setError('Nhập tên nhà nghỉ.')
    if (pin.length !== PIN_LENGTH) return setError(`Mã PIN phải gồm đúng ${PIN_LENGTH} chữ số.`)
    if (pin !== confirm) return setError('Hai lần nhập mã PIN không giống nhau.')
    if (codeRequired && !code.trim()) return setError('Nhập mã cài đặt.')

    setSaving(true)
    const refused = await setupOwner({
      ownerName: ownerName.trim(),
      propertyName: propertyName.trim(),
      pin,
      code: codeRequired ? code.trim() : undefined,
    })
    // Tạo xong thì màn hình này tự biến mất; chỉ cần xử lý khi bị từ chối.
    if (refused) {
      setSaving(false)
      setError(refused)
    }
  }

  const pinField = (label: string, value: string, setter: (value: string) => void) => (
    <label>
      <span className={fieldLabel}>{label}</span>
      <input
        className={`${input} text-center text-lg tracking-[0.5em]`}
        type="password"
        inputMode="numeric"
        autoComplete="new-password"
        maxLength={PIN_LENGTH}
        value={value}
        onChange={(event) => change(setter)(onlyDigits(event.target.value))}
      />
    </label>
  )

  return (
    <main className="flex min-h-dvh flex-col items-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <h1 className="text-center text-xl font-semibold text-slate-800">Cài đặt lần đầu</h1>
        <p className="mt-1 text-center text-sm text-slate-500">
          Tạo tài khoản chủ sở hữu và nhà nghỉ đầu tiên. Chỉ làm một lần.
        </p>

        <form
          className="mt-6 space-y-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200"
          onSubmit={(event) => {
            event.preventDefault()
            if (!saving) void submit()
          }}
        >
          <label className="block">
            <span className={fieldLabel}>Tên của bạn (chủ sở hữu)</span>
            <input
              className={input}
              autoComplete="off"
              maxLength={100}
              value={ownerName}
              onChange={(event) => change(setOwnerName)(event.target.value)}
            />
          </label>

          <label className="block">
            <span className={fieldLabel}>Tên nhà nghỉ</span>
            <input
              className={input}
              autoComplete="off"
              maxLength={100}
              value={propertyName}
              onChange={(event) => change(setPropertyName)(event.target.value)}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            {pinField(`Mã PIN (${PIN_LENGTH} số)`, pin, setPin)}
            {pinField('Nhập lại mã PIN', confirm, setConfirm)}
          </div>
          <p className="text-xs text-slate-500">
            Mã PIN này dùng để đăng nhập với quyền chủ. Sau này xem lại hoặc đổi ở Quản lý, mục Nhân viên.
          </p>

          {codeRequired && (
            <label className="block">
              <span className={fieldLabel}>Mã cài đặt</span>
              <input
                className={input}
                autoComplete="off"
                value={code}
                onChange={(event) => change(setCode)(event.target.value)}
              />
              <span className="mt-1 block text-xs text-slate-500">
                Là giá trị SETUP_CODE đã đặt trên máy chủ, để người lạ không tự nhận làm chủ được.
              </span>
            </label>
          )}

          <p className="min-h-5 text-sm text-red-600" role="alert">
            {error}
          </p>

          <button type="submit" className={`${btnPrimary} w-full py-3`}>
            {saving ? 'Đang tạo…' : 'Tạo và bắt đầu dùng'}
          </button>
        </form>
      </div>
    </main>
  )
}
