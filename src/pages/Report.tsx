import { useEffect, useState } from 'react'
import { addExpense, addShiftNote, fetchReport, removeExpense, useDb, type ReportData } from '../api'
import MoneyInput from '../components/MoneyInput'
import { btn, btnPrimary, input, removeButton } from '../components/ui'
import { dateKey, dayMonth, longDate, money, parseDateKey, shiftDateKey, time } from '../lib/format'
import { METHOD_LABEL } from '../lib/labels'
import {
  groupTotals,
  periodKey,
  periodTitle,
  propertyTotals,
  revenueTotal,
  type PeriodReport,
  type ReportMode,
  type Totals,
} from '../lib/report'
import { buildReportSheets } from '../lib/reportSheets'
import type { Property, Shift } from '../types'

// Báo cáo trống, dùng trong lúc chờ máy chủ trả số liệu.
const EMPTY_REPORT: PeriodReport = {
  shifts: [],
  payments: [],
  expenses: [],
  totals: { checkIns: 0, cash: 0, transfer: 0, spent: 0, cashDiff: 0 },
  revenue: { stays: 0, room: 0, service: 0, surcharge: 0, discount: 0 },
  notes: [],
}

const MODES: { mode: ReportMode; label: string }[] = [
  { mode: 'day', label: 'Ngày' },
  { mode: 'month', label: 'Tháng' },
  { mode: 'year', label: 'Năm' },
]

const th = 'py-2 font-medium'
const td = 'py-2'

// Lùi hoặc tiến một kỳ, giữ ngày neo ở đầu kỳ với tháng và năm.
function stepDate(mode: ReportMode, date: string, step: number): string {
  if (mode === 'day') return shiftDateKey(date, step)
  const d = parseDateKey(date)
  d.setDate(1)
  if (mode === 'month') d.setMonth(d.getMonth() + step)
  else d.setFullYear(d.getFullYear() + step)
  return dateKey(d)
}

interface Props {
  property: Property
  initialDate: string
}

export default function Report({ property, initialDate }: Props) {
  const db = useDb()
  const [mode, setMode] = useState<ReportMode>('day')
  const [date, setDate] = useState(initialDate)
  const [allProperties, setAllProperties] = useState(false)
  const [exportError, setExportError] = useState(false)
  const [data, setData] = useState<ReportData | null>(null)
  const [failed, setFailed] = useState('')

  // null là gộp mọi cơ sở.
  const propertyId = allProperties ? null : property.id

  // Số liệu do máy chủ tính bằng chính hàm báo cáo dùng chung. Tải lại mỗi khi dữ liệu chung
  // đổi (db), để khoản chi hay ghi chú vừa thêm hiện ngay.
  useEffect(() => {
    let cancelled = false
    fetchReport(propertyId, mode, date)
      .then((next) => {
        if (cancelled) return
        setData(next)
        setFailed('')
      })
      .catch((error: unknown) => {
        if (!cancelled) setFailed(error instanceof Error ? error.message : 'Không tải được báo cáo.')
      })
    return () => {
      cancelled = true
    }
  }, [propertyId, mode, date, db])

  const report = data?.report ?? EMPTY_REPORT
  const { totals, revenue } = report
  const income = totals.cash + totals.transfer
  const propertyName = (id: string) => data?.properties.find((p) => p.id === id)?.name ?? ''
  const stayInfo = (stayId: string) => {
    const stay = data?.stays.find((s) => s.id === stayId)
    return {
      room: data?.rooms.find((room) => room.id === stay?.roomId)?.number ?? '',
      guest: stay?.guestName ?? '',
    }
  }
  const roomOf = (stayId: string) => stayInfo(stayId).room

  // Khi xem gộp, mỗi cơ sở có một dòng riêng, và từng khoản thu, khoản chi, ghi chú đều ghi tên
  // cơ sở, vì hai cơ sở có thể trùng số phòng. Cơ sở đã ngừng chỉ hiện khi kỳ này có số liệu.
  const byProperty = propertyTotals(report, data?.properties.map((p) => p.id) ?? [])
  const hasNumbers = (t: Totals) => t.checkIns + t.cash + t.transfer + t.spent + Math.abs(t.cashDiff) > 0
  const listed = (data?.properties ?? []).filter(
    (p) => db.properties.find((item) => item.id === p.id)?.active || hasNumbers(byProperty.get(p.id)!),
  )
  const propertyOfShift = new Map(report.shifts.map((row) => [row.shift.id, row.shift.propertyId]))
  // Tên cơ sở đứng trước một dòng chi tiết; chỉ có khi đang xem gộp.
  const tag = (id: string | undefined) => (allProperties && id ? `${propertyName(id)} · ` : '')

  const exportExcel = async () => {
    setExportError(false)
    try {
      const { default: writeXlsxFile } = await import('write-excel-file/browser')
      const sheets = buildReportSheets(report, mode, {
        propertyName,
        roomOf: stayInfo,
        properties: allProperties ? listed.map((p) => p.id) : undefined,
      })
      const scope = allProperties ? 'tat-ca-co-so-' : ''
      await writeXlsxFile(sheets).toFile(`bao-cao-${scope}${periodKey(mode, date)}.xlsx`)
    } catch {
      setExportError(true)
    }
  }

  // Bấm một dòng của báo cáo tháng hoặc năm để xem kỳ nhỏ hơn.
  const drillDown = (key: string) => {
    if (mode === 'year') {
      setMode('month')
      setDate(`${key}-01`)
    } else {
      setMode('day')
      setDate(key)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          {MODES.map((item) => (
            <button
              key={item.mode}
              type="button"
              aria-pressed={mode === item.mode}
              className={mode === item.mode ? btnPrimary : btn}
              onClick={() => setMode(item.mode)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <button type="button" className={btn} onClick={exportExcel}>
          Xuất Excel
        </button>
      </div>
      {exportError && <p className="text-sm text-red-600">Không tạo được file Excel. Thử lại.</p>}
      {failed && <p className="text-sm text-red-600">{failed}</p>}
      {data === null && !failed && <p className="text-sm text-slate-500">Đang tải báo cáo…</p>}

      {db.properties.length > 1 && (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            aria-pressed={!allProperties}
            className={`${allProperties ? btn : btnPrimary} truncate`}
            onClick={() => setAllProperties(false)}
          >
            {property.name}
          </button>
          <button
            type="button"
            aria-pressed={allProperties}
            className={allProperties ? btnPrimary : btn}
            onClick={() => setAllProperties(true)}
          >
            Tất cả cơ sở
          </button>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <button type="button" className={btn} aria-label="Kỳ trước" onClick={() => setDate(stepDate(mode, date, -1))}>
          ‹
        </button>
        <h2 className="text-center text-base font-semibold text-slate-800">
          {mode === 'day' ? longDate(date) : periodTitle(mode, date)}
        </h2>
        <button type="button" className={btn} aria-label="Kỳ sau" onClick={() => setDate(stepDate(mode, date, 1))}>
          ›
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Tổng thu" value={money(income)} />
        <Stat label="Tổng chi" value={money(totals.spent)} />
        <Stat label="Còn lại" value={money(income - totals.spent)} />
        <Stat label="Lượt thuê" value={String(totals.checkIns)} />
      </div>

      {allProperties && (
        <section className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
          <h3 className="mb-2 text-sm font-semibold text-slate-800">Theo cơ sở</h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[38rem] text-right text-sm">
              <thead className="text-xs text-slate-500">
                <tr>
                  <th className={`${th} text-left`}>Cơ sở</th>
                  <th className={th}>Lượt</th>
                  <th className={th}>Tiền mặt</th>
                  <th className={th}>Chuyển khoản</th>
                  <th className={th}>Tổng thu</th>
                  <th className={th}>Tổng chi</th>
                  <th className={th}>Còn lại</th>
                  <th className={th}>Chênh lệch</th>
                </tr>
              </thead>
              <tbody>
                {listed.map((item) => {
                  const t = byProperty.get(item.id)!
                  return (
                    <tr key={item.id} className="border-t border-slate-100">
                      <td className={`${td} text-left font-medium`}>{item.name}</td>
                      <td className={td}>{t.checkIns}</td>
                      <td className={td}>{money(t.cash)}</td>
                      <td className={td}>{money(t.transfer)}</td>
                      <td className={`${td} font-medium`}>{money(t.cash + t.transfer)}</td>
                      <td className={td}>{money(t.spent)}</td>
                      <td className={td}>{money(t.cash + t.transfer - t.spent)}</td>
                      <td className={`${td} ${t.cashDiff === 0 ? '' : 'text-rose-600'}`}>{signed(t.cashDiff)}</td>
                    </tr>
                  )
                })}
                <tr className="border-t border-slate-200 font-semibold">
                  <td className={`${td} text-left`}>Tất cả</td>
                  <td className={td}>{totals.checkIns}</td>
                  <td className={td}>{money(totals.cash)}</td>
                  <td className={td}>{money(totals.transfer)}</td>
                  <td className={td}>{money(income)}</td>
                  <td className={td}>{money(totals.spent)}</td>
                  <td className={td}>{money(income - totals.spent)}</td>
                  <td className={`${td} ${totals.cashDiff === 0 ? '' : 'text-rose-600'}`}>{signed(totals.cashDiff)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      {mode === 'day' ? (
        <section className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
          <h3 className="mb-2 text-sm font-semibold text-slate-800">Theo ca</h3>
          {report.shifts.length === 0 ? (
            <p className="text-sm text-slate-500">Ngày này chưa có ca nào.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] text-right text-sm">
                <thead className="text-xs text-slate-500">
                  <tr>
                    {allProperties && <th className={`${th} text-left`}>Cơ sở</th>}
                    <th className={`${th} text-left`}>Ca</th>
                    <th className={`${th} text-left`}>Người trực</th>
                    <th className={th}>Lượt</th>
                    <th className={th}>Tiền mặt</th>
                    <th className={th}>Chuyển khoản</th>
                    <th className={th}>Tổng ca</th>
                    <th className={th}>Chênh lệch</th>
                  </tr>
                </thead>
                <tbody>
                  {report.shifts.map((row) => (
                    <tr key={row.shift.id} className="border-t border-slate-100">
                      {allProperties && <td className={`${td} text-left`}>{propertyName(row.shift.propertyId)}</td>}
                      <td className={`${td} text-left`}>{row.shift.label}</td>
                      <td className={`${td} text-left`}>{row.shift.userName}</td>
                      <td className={td}>{row.checkIns}</td>
                      <td className={td}>{money(row.cash)}</td>
                      <td className={td}>{money(row.transfer)}</td>
                      <td className={`${td} font-medium`}>{money(row.cash + row.transfer)}</td>
                      <td className={td}>
                        <ShiftDiff shift={row.shift} />
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-slate-200 font-semibold">
                    <td className={`${td} text-left`} colSpan={allProperties ? 3 : 2}>
                      Cả ngày
                    </td>
                    <td className={td}>{totals.checkIns}</td>
                    <td className={td}>{money(totals.cash)}</td>
                    <td className={td}>{money(totals.transfer)}</td>
                    <td className={td}>{money(income)}</td>
                    <td className={`${td} ${totals.cashDiff === 0 ? '' : 'text-rose-600'}`}>{signed(totals.cashDiff)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <PeriodTable
          mode={mode}
          date={date}
          groups={groupTotals(report, mode === 'month' ? 10 : 7)}
          totals={totals}
          onOpen={drillDown}
        />
      )}

      <section className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
        <h3 className="mb-2 text-sm font-semibold text-slate-800">Ghi chú</h3>
        {report.notes.length === 0 && <p className="text-sm text-slate-500">Kỳ này không có ghi chú nào.</p>}
        {report.notes.map((note, index) => (
          <p key={index} className="py-1 text-sm text-slate-700">
            <span className="text-slate-500">
              {mode !== 'day' && `${dayMonth(parseDateKey(note.date))} · `}
              {tag(note.propertyId)}
              {note.subject}
              {note.by && ` · ${note.by}`}:
            </span>{' '}
            {note.text}
          </p>
        ))}
        {mode === 'day' && report.shifts.length > 0 && <ShiftNoteForm shifts={report.shifts.map((row) => row.shift)} tag={tag} />}
      </section>

      <section className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
        <h3 className="mb-1 text-sm font-semibold text-slate-800">Cơ cấu doanh thu</h3>
        <p className="mb-2 text-xs text-slate-500">
          Tính trên {revenue.stays} lượt đã trả phòng trong kỳ, nên có thể khác tổng thu khi có tiền cọc hoặc thu trước.
        </p>
        <div className="flex justify-between py-1 text-sm">
          <span className="text-slate-600">Tiền phòng</span>
          <span>{money(revenue.room)}</span>
        </div>
        <div className="flex justify-between py-1 text-sm">
          <span className="text-slate-600">Dịch vụ</span>
          <span>{money(revenue.service)}</span>
        </div>
        <div className="flex justify-between py-1 text-sm">
          <span className="text-slate-600">Phụ thu</span>
          <span>{money(revenue.surcharge)}</span>
        </div>
        {revenue.discount > 0 && (
          <div className="flex justify-between py-1 text-sm">
            <span className="text-slate-600">Giảm giá</span>
            <span>−{money(revenue.discount)}</span>
          </div>
        )}
        <div className="mt-1 flex justify-between border-t border-slate-200 pt-2 text-sm font-semibold text-slate-800">
          <span>Tổng</span>
          <span>{money(revenueTotal(revenue))}</span>
        </div>
      </section>

      {mode === 'day' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <section className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
            <h3 className="mb-2 text-sm font-semibold text-slate-800">Khoản thu</h3>
            {report.payments.length === 0 && <p className="text-sm text-slate-500">Chưa có khoản thu nào.</p>}
            {report.payments.map((payment) => (
              <div key={payment.id} className="flex justify-between py-1 text-sm">
                <span className="text-slate-600">
                  {time(payment.at)} · {tag(propertyOfShift.get(payment.shiftId))}Phòng {roomOf(payment.stayId)} ·{' '}
                  {METHOD_LABEL[payment.method]}
                </span>
                <span>{money(payment.amount)}</span>
              </div>
            ))}
          </section>

          <section className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
            <h3 className="mb-2 text-sm font-semibold text-slate-800">Khoản chi</h3>
            {report.expenses.length === 0 && <p className="text-sm text-slate-500">Chưa có khoản chi nào.</p>}
            {report.expenses.map((expense) => (
              <div key={expense.id} className="flex items-center justify-between py-1 text-sm">
                <span className="text-slate-600">
                  {tag(expense.propertyId)}
                  {expense.name}
                  <button
                    type="button"
                    aria-label={`Bỏ khoản chi ${expense.name}`}
                    className={removeButton}
                    onClick={() => removeExpense(expense.id)}
                  >
                    ✕
                  </button>
                </span>
                <span>{money(expense.amount)}</span>
              </div>
            ))}
            {/* Khoản chi phải thuộc một cơ sở cụ thể, nên không thêm được khi đang xem gộp. */}
            {!allProperties && <ExpenseForm onAdd={(name, amount) => addExpense(property.id, name, amount, date)} />}
          </section>
        </div>
      )}
    </div>
  )
}

interface PeriodTableProps {
  mode: ReportMode
  date: string
  groups: Map<string, Totals>
  totals: Totals
  onOpen: (key: string) => void
}

function PeriodTable({ mode, date, groups, totals, onOpen }: PeriodTableProps) {
  // Báo cáo năm luôn hiện đủ 12 tháng; báo cáo tháng chỉ hiện những ngày có số liệu.
  const year = date.slice(0, 4)
  const keys =
    mode === 'year'
      ? Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, '0')}`)
      : [...groups.keys()]
  const empty: Totals = { checkIns: 0, cash: 0, transfer: 0, spent: 0, cashDiff: 0 }

  return (
    <section className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
      <h3 className="mb-2 text-sm font-semibold text-slate-800">{mode === 'year' ? 'Theo tháng' : 'Theo ngày'}</h3>
      {keys.length === 0 ? (
        <p className="text-sm text-slate-500">Tháng này chưa có số liệu.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-right text-sm">
            <thead className="text-xs text-slate-500">
              <tr>
                <th className={`${th} text-left`}>{mode === 'year' ? 'Tháng' : 'Ngày'}</th>
                <th className={th}>Lượt</th>
                <th className={th}>Tiền mặt</th>
                <th className={th}>Chuyển khoản</th>
                <th className={th}>Tổng thu</th>
                <th className={th}>Tổng chi</th>
                <th className={th}>Còn lại</th>
                <th className={th}>Chênh lệch</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => {
                const row = groups.get(key) ?? empty
                const income = row.cash + row.transfer
                return (
                  <tr key={key} className="border-t border-slate-100">
                    <td className={`${td} text-left`}>
                      <button type="button" className="underline decoration-dotted" onClick={() => onOpen(key)}>
                        {mode === 'year' ? `Tháng ${Number(key.slice(5))}` : dayMonth(parseDateKey(key))}
                      </button>
                    </td>
                    <td className={td}>{row.checkIns}</td>
                    <td className={td}>{money(row.cash)}</td>
                    <td className={td}>{money(row.transfer)}</td>
                    <td className={`${td} font-medium`}>{money(income)}</td>
                    <td className={td}>{money(row.spent)}</td>
                    <td className={td}>{money(income - row.spent)}</td>
                    <td className={`${td} ${row.cashDiff === 0 ? '' : 'text-rose-600'}`}>{signed(row.cashDiff)}</td>
                  </tr>
                )
              })}
              <tr className="border-t border-slate-200 font-semibold">
                <td className={`${td} text-left`}>Tổng</td>
                <td className={td}>{totals.checkIns}</td>
                <td className={td}>{money(totals.cash)}</td>
                <td className={td}>{money(totals.transfer)}</td>
                <td className={td}>{money(totals.cash + totals.transfer)}</td>
                <td className={td}>{money(totals.spent)}</td>
                <td className={td}>{money(totals.cash + totals.transfer - totals.spent)}</td>
                <td className={`${td} ${totals.cashDiff === 0 ? '' : 'text-rose-600'}`}>{signed(totals.cashDiff)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function signed(amount: number): string {
  if (amount === 0) return '0'
  return `${amount < 0 ? '−' : '+'}${money(Math.abs(amount))}`
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-xl font-semibold text-slate-800">{value}</p>
    </div>
  )
}

function ShiftDiff({ shift }: { shift: Shift }) {
  if (shift.closedAt === null) return <span className="text-slate-500">Đang mở</span>
  if (!shift.cashDiff) return <span className="text-emerald-600">Khớp</span>
  return <span className="text-rose-600">{signed(shift.cashDiff)}</span>
}

// Thêm ghi chú cho một ca của ngày đang xem, kể cả ca đã đóng.
// tag là tên cơ sở đứng trước tên ca khi đang xem gộp, vì hai cơ sở có thể cùng có "Ca sáng · Lan".
function ShiftNoteForm({ shifts, tag }: { shifts: Shift[]; tag: (propertyId: string) => string }) {
  const [shiftId, setShiftId] = useState(shifts[0].id)
  const [text, setText] = useState('')
  // Đổi ngày thì danh sách ca đổi theo; ca đang chọn có thể không còn trong danh sách.
  const selected = shifts.some((shift) => shift.id === shiftId) ? shiftId : shifts[0].id

  return (
    <form
      className="mt-3 grid grid-cols-[auto_1fr_auto] gap-2 border-t border-slate-100 pt-3"
      onSubmit={(event) => {
        event.preventDefault()
        if (!text.trim()) return
        addShiftNote(selected, text.trim())
        setText('')
      }}
    >
      <select
        className={input}
        aria-label="Ca cần ghi chú"
        value={selected}
        onChange={(event) => setShiftId(event.target.value)}
      >
        {shifts.map((shift) => (
          <option key={shift.id} value={shift.id}>
            {tag(shift.propertyId)}Ca {shift.label.toLowerCase()} · {shift.userName}
          </option>
        ))}
      </select>
      <input
        className={input}
        placeholder="Ghi chú cho ca"
        aria-label="Nội dung ghi chú cho ca"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <button type="submit" className={btn}>
        Thêm
      </button>
    </form>
  )
}

function ExpenseForm({ onAdd }: { onAdd: (name: string, amount: number) => void }) {
  const [name, setName] = useState('')
  const [amount, setAmount] = useState(0)
  const [error, setError] = useState(false)

  return (
    <form
      className="mt-3 space-y-2 border-t border-slate-100 pt-3"
      onSubmit={(event) => {
        event.preventDefault()
        if (!name.trim() || amount <= 0) {
          setError(true)
          return
        }
        onAdd(name.trim(), amount)
        setName('')
        setAmount(0)
      }}
    >
      <div className="grid grid-cols-2 gap-2">
        <input
          className={input}
          placeholder="Giặt là"
          aria-label="Tên khoản chi"
          value={name}
          onChange={(event) => {
            setName(event.target.value)
            setError(false)
          }}
        />
        <MoneyInput
          ariaLabel="Số tiền chi"
          value={amount}
          onChange={(value) => {
            setAmount(value)
            setError(false)
          }}
        />
      </div>
      {error && <p className="text-sm text-red-600">Nhập tên khoản chi và số tiền.</p>}
      <button type="submit" className={`${btn} w-full`}>
        Thêm khoản chi
      </button>
    </form>
  )
}
