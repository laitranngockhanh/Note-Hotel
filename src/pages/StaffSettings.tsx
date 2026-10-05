import { useState } from 'react'
import { PIN_LENGTH, addUser, deleteUser, getUserPin, setUserActive, updateUser, useDb } from '../api'
import { btn, btnPrimary, fieldLabel, input } from '../components/ui'
import type { Role, User } from '../types'

const ROLE_LABEL: Record<Role, string> = { owner: 'Chủ', staff: 'Người trực' }
const ROLES: Role[] = ['staff', 'owner']

const card = 'rounded-xl bg-white p-4 ring-1 ring-slate-200'
const cardTitle = 'mb-3 text-sm font-semibold text-slate-800'

interface Message {
  text: string
  failed: boolean
}

function Note({ message }: { message: Message | null }) {
  if (!message) return null
  return <p className={`text-sm ${message.failed ? 'text-red-600' : 'text-emerald-600'}`}>{message.text}</p>
}

// Ô nhập PIN: chỉ nhận chữ số, không hiện số đã gõ.
function PinInput({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
  return (
    <label>
      <span className={fieldLabel}>{label}</span>
      <input
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={PIN_LENGTH}
        className={input}
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, ''))}
      />
    </label>
  )
}

function RoleSelect({ value, onChange }: { value: Role; onChange: (value: Role) => void }) {
  return (
    <label>
      <span className={fieldLabel}>Vai trò</span>
      <select className={input} value={value} onChange={(event) => onChange(event.target.value as Role)}>
        {ROLES.map((role) => (
          <option key={role} value={role}>
            {ROLE_LABEL[role]}
          </option>
        ))}
      </select>
    </label>
  )
}

interface Props {
  currentUserId: string
}

// Tài khoản dùng chung cho mọi cơ sở. Chủ xem được PIN của từng người để nhắc lại khi họ
// quên, không cần đặt PIN mới; PIN mặc định bị che và chỉ hiện khi bấm Xem.
export default function StaffSettings({ currentUserId }: Props) {
  const db = useDb()
  const users = [...db.users].sort((a, b) => Number(b.active) - Number(a.active))

  return (
    <div className="space-y-4">
      <section className={card}>
        <h2 className={cardTitle}>Nhân viên</h2>
        <p className="mb-3 text-xs text-slate-500">
          Mỗi người một mã PIN riêng, dùng được ở mọi cơ sở. Bấm Xem để nhắc lại PIN cho người quên. Người đã nghỉ thì
          ngừng hoạt động để giữ lại tên trong các ca cũ.
        </p>
        <div className="space-y-2">
          {users.map((user) => (
            <UserForm key={user.id} user={user} isSelf={user.id === currentUserId} />
          ))}
        </div>
      </section>

      <NewUserForm />
    </div>
  )
}

function UserForm({ user, isSelf }: { user: User; isSelf: boolean }) {
  const [name, setName] = useState(user.name)
  const [role, setRole] = useState(user.role)
  const [pin, setPin] = useState('')
  // PIN đang hiện, lấy từ máy chủ khi bấm Xem; null là đang che.
  const [shownPin, setShownPin] = useState<string | null>(null)
  const [message, setMessage] = useState<Message | null>(null)

  const run = (error: string | null, done: string) => setMessage({ text: error ?? done, failed: error !== null })

  const togglePin = async () => {
    if (shownPin !== null) return setShownPin(null)
    const current = await getUserPin(user.id)
    if (current === null) return run('Không xem được mã PIN. Thử lại.', '')
    setShownPin(current)
  }

  return (
    <details className="rounded-lg ring-1 ring-slate-200" onToggle={() => setShownPin(null)}>
      <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm">
        <span className={`font-medium ${user.active ? 'text-slate-800' : 'text-slate-400'}`}>
          {user.name}
          {isSelf && ' (bạn)'}
        </span>
        <span className="text-xs text-slate-500">
          {ROLE_LABEL[user.role]}
          {!user.active && ' · Đã ngừng'}
        </span>
      </summary>
      <form
        className="space-y-3 border-t border-slate-200 p-3"
        onSubmit={async (event) => {
          event.preventDefault()
          if (!name.trim()) return run('Nhập tên nhân viên.', '')
          const error = await updateUser(user.id, name.trim(), role, pin)
          if (!error) {
            setPin('')
            // PIN vừa đổi thì bản đang hiện đã cũ.
            setShownPin(null)
          }
          run(error, 'Đã lưu.')
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className={fieldLabel}>Tên</span>
            <input
              className={input}
              value={name}
              onChange={(event) => {
                setName(event.target.value)
                setMessage(null)
              }}
            />
          </label>
          <RoleSelect
            value={role}
            onChange={(value) => {
              setRole(value)
              setMessage(null)
            }}
          />
          <PinInput
            label="Mã PIN mới (để trống nếu giữ nguyên)"
            value={pin}
            onChange={(value) => {
              setPin(value)
              setMessage(null)
            }}
          />
          <div>
            <span className={fieldLabel}>Mã PIN hiện tại</span>
            <div className="flex items-center gap-2">
              <span className="flex-1 rounded-lg bg-slate-50 px-3 py-2 font-mono text-sm tracking-widest text-slate-800 ring-1 ring-slate-200">
                {shownPin ?? '•'.repeat(PIN_LENGTH)}
              </span>
              <button type="button" className={btn} aria-pressed={shownPin !== null} onClick={togglePin}>
                {shownPin !== null ? 'Ẩn' : 'Xem'}
              </button>
            </div>
          </div>
        </div>

        <Note message={message} />

        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            className={`${btn} text-red-600`}
            onClick={async () => run(await deleteUser(user.id), 'Đã xóa.')}
          >
            Xóa
          </button>
          <button
            type="button"
            className={btn}
            onClick={async () =>
              run(await setUserActive(user.id, !user.active), user.active ? 'Đã ngừng hoạt động.' : 'Đã mở lại.')
            }
          >
            {user.active ? 'Ngừng hoạt động' : 'Mở lại'}
          </button>
          <button type="submit" className={btnPrimary}>
            Lưu
          </button>
        </div>
      </form>
    </details>
  )
}

function NewUserForm() {
  const [name, setName] = useState('')
  const [role, setRole] = useState<Role>('staff')
  const [pin, setPin] = useState('')
  const [message, setMessage] = useState<Message | null>(null)

  return (
    <form
      className={card}
      onSubmit={async (event) => {
        event.preventDefault()
        if (!name.trim()) return setMessage({ text: 'Nhập tên nhân viên.', failed: true })
        const error = await addUser(name.trim(), role, pin)
        if (error) return setMessage({ text: error, failed: true })
        setMessage({ text: `Đã thêm ${name.trim()}.`, failed: false })
        setName('')
        setPin('')
        setRole('staff')
      }}
    >
      <h2 className={cardTitle}>Thêm nhân viên</h2>
      <div className="grid grid-cols-2 gap-3">
        <label>
          <span className={fieldLabel}>Tên</span>
          <input
            className={input}
            value={name}
            onChange={(event) => {
              setName(event.target.value)
              setMessage(null)
            }}
          />
        </label>
        <RoleSelect value={role} onChange={setRole} />
        <PinInput
          label={`Mã PIN (${PIN_LENGTH} chữ số)`}
          value={pin}
          onChange={(value) => {
            setPin(value)
            setMessage(null)
          }}
        />
      </div>
      <div className="mt-2">
        <Note message={message} />
      </div>
      <button type="submit" className={`${btnPrimary} mt-3 w-full`}>
        Thêm nhân viên
      </button>
    </form>
  )
}
