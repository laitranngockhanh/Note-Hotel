import type { SheetData } from 'write-excel-file/browser'
import { dayMonth, parseDateKey, time } from './format'
import { METHOD_LABEL } from './labels'
import {
  groupTotals,
  periodTitle,
  propertyTotals,
  revenueTotal,
  type PeriodReport,
  type ReportMode,
  type Totals,
} from './report'

// Nội dung file Excel của báo cáo. Tách khỏi report.ts để phần tính báo cáo không phụ thuộc
// thư viện Excel và dùng chung được với máy chủ.

export interface ReportSheet {
  sheet: string
  columns: { width: number }[]
  data: SheetData
}

const head = (value: string) => ({ value, fontWeight: 'bold' as const })
const num = (value: number, bold = false) => ({
  value,
  type: Number,
  format: '#,##0',
  ...(bold ? { fontWeight: 'bold' as const } : {}),
})
const widths = (...values: number[]) => values.map((width) => ({ width }))

function dateLabel(key: string): string {
  const d = parseDateKey(key)
  return `${dayMonth(d)}/${d.getFullYear()}`
}

// Thứ báo cáo không tự có: tên cơ sở, và số phòng cùng tên khách của một lượt thuê.
export interface ReportLookup {
  propertyName: (propertyId: string) => string
  roomOf: (stayId: string) => { room: string; guest: string }
  // Có khi báo cáo gộp nhiều cơ sở: danh sách cơ sở cần liệt kê. Khi đó file có thêm trang
  // "Theo cơ sở", và mỗi khoản thu, khoản chi, ghi chú có thêm cột Cơ sở.
  properties?: string[]
}

// Nội dung file Excel của một kỳ báo cáo: bảng tổng hợp, từng khoản thu, từng khoản chi.
export function buildReportSheets(report: PeriodReport, mode: ReportMode, lookup: ReportLookup): ReportSheet[] {
  const { totals, revenue } = report
  const { propertyName, roomOf } = lookup
  const moneyHead = ['Lượt thuê', 'Tiền mặt', 'Chuyển khoản', 'Tổng thu'].map(head)
  const moneyCells = (t: Totals, bold = false) => [
    num(t.checkIns, bold),
    num(t.cash, bold),
    num(t.transfer, bold),
    num(t.cash + t.transfer, bold),
  ]

  let summary: SheetData
  if (mode === 'day') {
    summary = [
      [head('Cơ sở'), head('Ca'), head('Người trực'), ...moneyHead, head('Chênh lệch'), head('Ghi chú')],
      ...report.shifts.map((row) => [
        propertyName(row.shift.propertyId),
        row.shift.label,
        row.shift.userName,
        ...moneyCells(row),
        num(row.cashDiff),
        row.shift.note,
      ]),
      [head('Cả ngày'), '', '', ...moneyCells(totals, true), num(totals.cashDiff, true), ''],
    ]
  } else {
    const groups = groupTotals(report, mode === 'month' ? 10 : 7)
    summary = [
      [head(mode === 'month' ? 'Ngày' : 'Tháng'), ...moneyHead, head('Tổng chi'), head('Còn lại'), head('Chênh lệch')],
      ...[...groups].map(([key, t]) => [
        mode === 'month' ? dateLabel(key) : periodTitle('month', key),
        ...moneyCells(t),
        num(t.spent),
        num(t.cash + t.transfer - t.spent),
        num(t.cashDiff),
      ]),
      [
        head('Tổng'),
        ...moneyCells(totals, true),
        num(totals.spent, true),
        num(totals.cash + totals.transfer - totals.spent, true),
        num(totals.cashDiff, true),
      ],
    ]
  }

  const shiftOf = new Map(report.shifts.map((row) => [row.shift.id, row.shift]))

  // Cột Cơ sở đứng đầu mỗi dòng chi tiết, chỉ có khi báo cáo gộp nhiều cơ sở.
  const merged = lookup.properties !== undefined
  const propertyHead = merged ? [head('Cơ sở')] : []
  const propertyCell = (propertyId: string) => (merged ? [propertyName(propertyId)] : [])
  const propertyWidth = merged ? [22] : []

  const perProperty = propertyTotals(report, lookup.properties ?? [])
  const byProperty: SheetData = [
    [head('Cơ sở'), ...moneyHead, head('Tổng chi'), head('Còn lại'), head('Chênh lệch')],
    ...[...perProperty].map(([propertyId, t]) => [
      propertyName(propertyId),
      ...moneyCells(t),
      num(t.spent),
      num(t.cash + t.transfer - t.spent),
      num(t.cashDiff),
    ]),
    [
      head('Tất cả'),
      ...moneyCells(totals, true),
      num(totals.spent, true),
      num(totals.cash + totals.transfer - totals.spent, true),
      num(totals.cashDiff, true),
    ],
  ]

  const income: SheetData = [
    [...propertyHead, ...['Ngày', 'Giờ', 'Phòng', 'Khách', 'Hình thức', 'Số tiền', 'Ca', 'Người thu'].map(head)],
    ...report.payments.map((payment) => {
      const shift = shiftOf.get(payment.shiftId)!
      const { room, guest } = roomOf(payment.stayId)
      return [
        ...propertyCell(shift.propertyId),
        dateLabel(shift.businessDate),
        time(payment.at),
        room,
        guest,
        METHOD_LABEL[payment.method],
        num(payment.amount),
        shift.label,
        shift.userName,
      ]
    }),
  ]

  const spending: SheetData = [
    [...propertyHead, ...['Ngày', 'Khoản chi', 'Số tiền'].map(head)],
    ...report.expenses.map((expense) => [
      ...propertyCell(expense.propertyId),
      dateLabel(expense.businessDate),
      expense.name,
      num(expense.amount),
    ]),
  ]

  const breakdown: SheetData = [
    [head('Lượt đã trả phòng'), num(revenue.stays)],
    [head('Tiền phòng'), num(revenue.room)],
    [head('Dịch vụ'), num(revenue.service)],
    [head('Phụ thu'), num(revenue.surcharge)],
    [head('Giảm giá'), num(-revenue.discount)],
    [head('Tổng'), num(revenueTotal(revenue), true)],
  ]

  return [
    { sheet: 'Tổng hợp', columns: widths(22, 14, 14, 12, 14, 14, 14, 14, 18), data: summary },
    ...(merged ? [{ sheet: 'Theo cơ sở', columns: widths(22, 12, 14, 14, 14, 14, 14, 14), data: byProperty }] : []),
    { sheet: 'Khoản thu', columns: widths(...propertyWidth, 12, 8, 8, 18, 14, 14, 8, 14), data: income },
    { sheet: 'Khoản chi', columns: widths(...propertyWidth, 12, 28, 14), data: spending },
    { sheet: 'Cơ cấu doanh thu', columns: widths(22, 14), data: breakdown },
    {
      sheet: 'Ghi chú',
      columns: widths(...propertyWidth, 12, 14, 14, 60),
      data: [
        [...propertyHead, ...['Ngày', 'Về', 'Người ghi', 'Nội dung'].map(head)],
        ...report.notes.map((note) => [
          ...propertyCell(note.propertyId),
          dateLabel(note.date),
          note.subject,
          note.by,
          note.text,
        ]),
      ],
    },
  ]
}
