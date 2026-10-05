import { Fragment, useEffect, useRef, useState } from 'react'
import {
  addRoomType,
  addService,
  deleteRoomType,
  deleteService,
  saveRoomType,
  saveService,
  setPropertyAccess,
  setPropertyBank,
  updateSettings,
  useDb,
} from '../api'
import MoneyInput from '../components/MoneyInput'
import NumberInput from '../components/NumberInput'
import { btn, btnPrimary, fieldLabel, input } from '../components/ui'
import { money } from '../lib/format'
import { BANKS } from '../lib/vietqr'
import type { PriceList, Property, RoomType, Service, Settings as Rules } from '../types'

const PRICE_LABELS: { key: keyof PriceList; label: string }[] = [
  { key: 'firstHour', label: 'Giờ đầu' },
  { key: 'nextHour', label: 'Mỗi giờ tiếp theo' },
  { key: 'overnight', label: 'Qua đêm' },
  { key: 'day', label: 'Theo ngày' },
  { key: 'week', label: 'Theo tuần' },
  { key: 'month', label: 'Theo tháng' },
]

const card = 'rounded-xl bg-white p-4 ring-1 ring-slate-200'
const cardTitle = 'mb-3 text-sm font-semibold text-slate-800'
const savedNote = 'text-sm text-emerald-600'

// Mọi cài đặt riêng của cơ sở đang mở: giá, dịch vụ, quyền của người trực, tài khoản
// ngân hàng và quy tắc tính tiền.
export default function PricingSettings({ property }: { property: Property }) {
  const db = useDb()
  const types = db.roomTypes.filter((type) => type.propertyId === property.id)
  const services = db.services.filter((service) => service.propertyId === property.id)
  const [addedId, setAddedId] = useState('')

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">Đang sửa cho {property.name}.</p>

      <section className={card}>
        <h2 className={cardTitle}>Loại phòng và giá mặc định</h2>
        <p className="mb-3 text-xs text-slate-500">
          Giá mới chỉ áp dụng cho lượt thuê nhận sau khi lưu. Lượt đang ở giữ giá đã chốt.
        </p>
        <div className="space-y-2">
          {types.map((type) => (
            // Loại phòng vừa thêm, hoặc chưa có giá, thì mở sẵn để nhập luôn; còn lại thu gọn.
            <RoomTypeForm key={type.id} type={type} startOpen={type.id === addedId || type.prices.firstHour === 0} />
          ))}
        </div>
        <button
          type="button"
          className={`${btn} mt-3 w-full`}
          onClick={async () => setAddedId((await addRoomType(property.id))?.id ?? '')}
        >
          Thêm loại phòng
        </button>
      </section>

      <section className={card}>
        <h2 className={cardTitle}>Dịch vụ</h2>
        <div className="space-y-2">
          {services.map((service) => (
            <ServiceRow key={service.id} service={service} />
          ))}
        </div>
        <NewServiceForm propertyId={property.id} />
      </section>

      <AccessForm property={property} />

      <BankForm property={property} />

      <RulesForm propertyId={property.id} rules={property.settings} />
    </div>
  )
}

function RoomTypeForm({ type, startOpen }: { type: RoomType; startOpen: boolean }) {
  const [draft, setDraft] = useState(type)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  // Chỉ tự mở, không tự đóng: lưu giá xong thì form vẫn mở để thấy dòng "Đã lưu".
  const details = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    if (startOpen && details.current) details.current.open = true
  }, [startOpen])

  const change = (next: RoomType) => {
    setDraft(next)
    setMessage('')
  }
  const report = (text: string, isError: boolean) => {
    setMessage(text)
    setFailed(isError)
  }

  return (
    <details ref={details} className="rounded-lg ring-1 ring-slate-200">
      <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm">
        <span className="font-medium text-slate-800">{type.name}</span>
        <span className="text-xs text-slate-500">
          Giờ đầu {money(type.prices.firstHour)} · Ngày {money(type.prices.day)}
        </span>
      </summary>
      <form
        className="space-y-3 border-t border-slate-200 p-3"
        onSubmit={(event) => {
          event.preventDefault()
          if (!draft.name.trim()) return report('Nhập tên loại phòng.', true)
          saveRoomType({ ...draft, name: draft.name.trim() })
          report('Đã lưu.', false)
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className={fieldLabel}>Tên loại phòng</span>
            <input className={input} value={draft.name} onChange={(event) => change({ ...draft, name: event.target.value })} />
          </label>
          <label>
            <span className={fieldLabel}>Số người tiêu chuẩn</span>
            <NumberInput
              min={1}
              max={50}
              value={draft.standardGuests}
              onChange={(standardGuests) => change({ ...draft, standardGuests })}
            />
          </label>
          {PRICE_LABELS.map((field) => (
            <label key={field.key}>
              <span className={fieldLabel}>{field.label}</span>
              <MoneyInput
                value={draft.prices[field.key]}
                onChange={(value) => change({ ...draft, prices: { ...draft.prices, [field.key]: value } })}
              />
            </label>
          ))}
          <label className="col-span-2">
            <span className={fieldLabel}>Phụ thu mỗi người vượt số tiêu chuẩn (tính một lần cho cả lượt)</span>
            <MoneyInput value={draft.extraGuestFee} onChange={(extraGuestFee) => change({ ...draft, extraGuestFee })} />
          </label>
        </div>

        {message && <p className={failed ? 'text-sm text-red-600' : savedNote}>{message}</p>}

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className={`${btn} text-red-600`}
            onClick={async () => {
              // Máy chủ từ chối nếu còn phòng thuộc loại này, và trả về câu giải thích.
              const refused = await deleteRoomType(type.id)
              if (refused) report(refused, true)
            }}
          >
            Xóa loại phòng
          </button>
          <button type="submit" className={btnPrimary}>
            Lưu
          </button>
        </div>
      </form>
    </details>
  )
}

function ServiceRow({ service }: { service: Service }) {
  const [draft, setDraft] = useState(service)
  const [state, setState] = useState<'idle' | 'saved' | 'error'>('idle')

  const change = (next: Service) => {
    setDraft(next)
    setState('idle')
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        if (!draft.name.trim() || draft.price <= 0) return setState('error')
        saveService({ ...draft, name: draft.name.trim() })
        setState('saved')
      }}
    >
      <div className="grid grid-cols-[1fr_7rem_auto_auto] items-center gap-2">
        <input
          className={input}
          aria-label="Tên dịch vụ"
          value={draft.name}
          onChange={(event) => change({ ...draft, name: event.target.value })}
        />
        <MoneyInput ariaLabel={`Giá ${service.name}`} value={draft.price} onChange={(price) => change({ ...draft, price })} />
        <button type="submit" className={btn}>
          Lưu
        </button>
        <button
          type="button"
          className={`${btn} text-red-600`}
          aria-label={`Xóa ${service.name}`}
          onClick={() => deleteService(service.id)}
        >
          Xóa
        </button>
      </div>
      {state === 'saved' && <p className={`${savedNote} mt-1`}>Đã lưu.</p>}
      {state === 'error' && <p className="mt-1 text-sm text-red-600">Nhập tên và giá dịch vụ.</p>}
    </form>
  )
}

function NewServiceForm({ propertyId }: { propertyId: string }) {
  const [name, setName] = useState('')
  const [price, setPrice] = useState(0)
  const [error, setError] = useState(false)

  return (
    <form
      className="mt-3 border-t border-slate-100 pt-3"
      onSubmit={(event) => {
        event.preventDefault()
        if (!name.trim() || price <= 0) return setError(true)
        addService(propertyId, name.trim(), price)
        setName('')
        setPrice(0)
      }}
    >
      <div className="grid grid-cols-[1fr_7rem_auto] items-center gap-2">
        <input
          className={input}
          placeholder="Khăn tắm"
          aria-label="Tên dịch vụ mới"
          value={name}
          onChange={(event) => {
            setName(event.target.value)
            setError(false)
          }}
        />
        <MoneyInput
          ariaLabel="Giá dịch vụ mới"
          value={price}
          onChange={(value) => {
            setPrice(value)
            setError(false)
          }}
        />
        <button type="submit" className={btn}>
          Thêm
        </button>
      </div>
      {error && <p className="mt-1 text-sm text-red-600">Nhập tên và giá dịch vụ.</p>}
    </form>
  )
}

function HourField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label>
      <span className={fieldLabel}>{label}</span>
      <NumberInput max={23} value={value} onChange={onChange} />
    </label>
  )
}

// Quyền của người trực ở cơ sở này: ai được trực, và có được sửa giá không.
function AccessForm({ property }: { property: Property }) {
  const db = useDb()
  const staff = db.users.filter((user) => user.role === 'staff' && user.active)
  const [restricted, setRestricted] = useState(property.staffIds !== null)
  const [selected, setSelected] = useState<string[]>(property.staffIds ?? staff.map((user) => user.id))
  const [canEditPrice, setCanEditPrice] = useState(property.staffCanEditPrice)
  const [saved, setSaved] = useState(false)
  const [failed, setFailed] = useState('')

  const toggle = (userId: string) => {
    setSelected(selected.includes(userId) ? selected.filter((id) => id !== userId) : [...selected, userId])
    setSaved(false)
  }

  return (
    <form
      className={card}
      onSubmit={async (event) => {
        event.preventDefault()
        const error = await setPropertyAccess(property.id, restricted ? selected : null, canEditPrice)
        setFailed(error ?? '')
        setSaved(error === null)
      }}
    >
      <h2 className={cardTitle}>Người trực ở cơ sở này</h2>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={canEditPrice}
          onChange={(event) => {
            setCanEditPrice(event.target.checked)
            setSaved(false)
          }}
        />
        Người trực được sửa giá lúc nhận phòng và đặt trước
      </label>

      <fieldset className="mt-4 space-y-2 text-sm text-slate-700">
        <legend className={fieldLabel}>Ai được trực ở đây</legend>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="staff-scope"
            checked={!restricted}
            onChange={() => {
              setRestricted(false)
              setSaved(false)
            }}
          />
          Mọi người trực
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="staff-scope"
            checked={restricted}
            onChange={() => {
              setRestricted(true)
              setSaved(false)
            }}
          />
          Chỉ những người được chọn
        </label>
        {restricted && (
          <div className="ml-6 space-y-1">
            {staff.map((user) => (
              <label key={user.id} className="flex items-center gap-2">
                <input type="checkbox" checked={selected.includes(user.id)} onChange={() => toggle(user.id)} />
                {user.name}
              </label>
            ))}
            {staff.length === 0 && <p className="text-xs text-slate-500">Chưa có người trực nào.</p>}
          </div>
        )}
      </fieldset>

      <p className="mt-3 text-xs text-slate-500">Chủ luôn vào được mọi cơ sở và luôn sửa được giá.</p>
      {saved && <p className={`${savedNote} mt-2`}>Đã lưu.</p>}
      {failed && <p className="mt-2 text-sm text-red-600">{failed}</p>}
      <button type="submit" className={`${btnPrimary} mt-3 w-full`}>
        Lưu quyền
      </button>
    </form>
  )
}

// Tài khoản nhận chuyển khoản của cơ sở. Có tài khoản thì màn hình thanh toán hiện mã QR.
function BankForm({ property }: { property: Property }) {
  const [bin, setBin] = useState(property.bank?.bin ?? '')
  const [accountNumber, setAccountNumber] = useState(property.bank?.accountNumber ?? '')
  const [accountName, setAccountName] = useState(property.bank?.accountName ?? '')
  const [message, setMessage] = useState<{ text: string; failed: boolean } | null>(null)

  const run = (error: string | null, done: string) => setMessage({ text: error ?? done, failed: error !== null })

  // Phần này không bắt buộc, nên thu gọn lại; chỉ mở sẵn khi cơ sở đã có tài khoản.
  return (
    <details className={card} open={property.bank !== null || undefined}>
      <summary className="cursor-pointer text-sm font-semibold text-slate-800">
        Mã QR chuyển khoản{' '}
        <span className="font-normal text-slate-500">
          {property.bank ? `· đang dùng tài khoản ${property.bank.accountNumber}` : '· không bắt buộc, chưa cài'}
        </span>
      </summary>
      <form
        className="mt-3"
        onSubmit={async (event) => {
          event.preventDefault()
          // Kiểm tra trước ở đây để báo lỗi dễ hiểu; máy chủ vẫn kiểm tra lại.
          if (!bin) return run('Chọn ngân hàng.', '')
          if (!/^\d{6,19}$/.test(accountNumber)) return run('Số tài khoản gồm 6 đến 19 chữ số.', '')
          if (!accountName.trim()) return run('Nhập tên chủ tài khoản.', '')
          run(await setPropertyBank(property.id, { bin, accountNumber, accountName }), 'Đã lưu.')
        }}
      >
        <p className="mb-3 text-xs text-slate-500">
          Khách không thấy màn hình này. Nhập tài khoản một lần ở đây thì lúc thanh toán, màn hình của phòng hiện mã QR có
          sẵn số tiền để đưa khách quét. Không dùng mã QR (khách tự chuyển khoản hoặc quét mã in sẵn ở quầy) thì bỏ
          trống phần này. Lưu xong nên quét thử bằng ứng dụng ngân hàng của bạn để chắc mã ra đúng tài khoản.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className={fieldLabel}>Ngân hàng</span>
            <select
              className={input}
              value={bin}
              onChange={(event) => {
                setBin(event.target.value)
                setMessage(null)
              }}
            >
              <option value="">Chọn ngân hàng</option>
              {BANKS.map((bank) => (
                <option key={bank.bin} value={bank.bin}>
                  {bank.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={fieldLabel}>Số tài khoản</span>
            <input
              inputMode="numeric"
              className={input}
              value={accountNumber}
              onChange={(event) => {
                setAccountNumber(event.target.value.replace(/\D/g, ''))
                setMessage(null)
              }}
            />
          </label>
          <label className="col-span-2">
            <span className={fieldLabel}>Tên chủ tài khoản</span>
            <input
              className={input}
              value={accountName}
              onChange={(event) => {
                setAccountName(event.target.value)
                setMessage(null)
              }}
            />
          </label>
        </div>
        {message && (
          <p className={`mt-2 text-sm ${message.failed ? 'text-red-600' : 'text-emerald-600'}`}>{message.text}</p>
        )}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            className={btn}
            onClick={async () => {
              setBin('')
              setAccountNumber('')
              setAccountName('')
              run(await setPropertyBank(property.id, null), 'Đã bỏ tài khoản.')
            }}
          >
            Bỏ tài khoản
          </button>
          <button type="submit" className={btnPrimary}>
            Lưu
          </button>
        </div>
      </form>
    </details>
  )
}

function RulesForm({ propertyId, rules }: { propertyId: string; rules: Rules }) {
  const [draft, setDraft] = useState(rules)
  const [saved, setSaved] = useState(false)

  const change = (next: Rules) => {
    setDraft(next)
    setSaved(false)
  }

  return (
    <form
      className={card}
      onSubmit={(event) => {
        event.preventDefault()
        updateSettings(propertyId, draft)
        setSaved(true)
      }}
    >
      <h2 className={cardTitle}>Quy tắc tính tiền</h2>
      <p className="mb-3 text-xs text-slate-500">Chỉ áp dụng cho cơ sở này.</p>
      <div className="grid grid-cols-2 gap-3">
        <label>
          <span className={fieldLabel}>Số phút ân hạn</span>
          <NumberInput
            max={59}
            value={draft.graceMinutes}
            onChange={(graceMinutes) => change({ ...draft, graceMinutes })}
          />
        </label>
        <label>
          <span className={fieldLabel}>Giờ trả phòng chuẩn</span>
          <NumberInput
            max={23}
            value={draft.checkoutHour}
            onChange={(checkoutHour) => change({ ...draft, checkoutHour })}
          />
        </label>
        <HourField
          label="Nhận qua đêm từ (giờ)"
          value={draft.overnightFromHour}
          onChange={(overnightFromHour) => change({ ...draft, overnightFromHour })}
        />
        <HourField
          label="Nhận qua đêm đến (giờ)"
          value={draft.overnightToHour}
          onChange={(overnightToHour) => change({ ...draft, overnightToHour })}
        />
      </div>

      <h3 className="mt-4 mb-2 text-xs font-medium text-slate-500">Phụ thu trả phòng muộn, tính trên giá ngày</h3>
      <div className="grid grid-cols-2 gap-3">
        {draft.lateFees.map((fee, index) => {
          const setFee = (next: Partial<typeof fee>) =>
            change({ ...draft, lateFees: draft.lateFees.map((f, i) => (i === index ? { ...f, ...next } : f)) })
          return (
            <Fragment key={index}>
              <HourField
                label={`Mức ${index + 1}: trả trước (giờ)`}
                value={fee.untilHour}
                onChange={(untilHour) => setFee({ untilHour })}
              />
              <label>
                <span className={fieldLabel}>Mức {index + 1}: phụ thu (%)</span>
                <NumberInput max={100} value={fee.percent} onChange={(percent) => setFee({ percent })} />
              </label>
            </Fragment>
          )
        })}
      </div>
      <p className="mt-2 text-xs text-slate-500">Trả sau mức cuối thì tính thêm trọn một ngày.</p>

      {saved && <p className={`${savedNote} mt-2`}>Đã lưu.</p>}
      <button type="submit" className={`${btnPrimary} mt-3 w-full`}>
        Lưu quy tắc
      </button>
    </form>
  )
}
