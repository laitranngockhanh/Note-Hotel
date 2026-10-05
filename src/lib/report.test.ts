import { describe, expect, it } from 'vitest'
import writeXlsxFile from 'write-excel-file/node'
import type { Db, PaymentMethod, PriceList, Shift, ShiftLabel, Stay, StayItem } from '../types'
import { groupTotals, periodReport, propertyTotals } from './report'
import { buildReportSheets } from './reportSheets'

// Một ngày kinh doanh của hai cơ sở, đủ để kiểm tra báo cáo: p1 có ca sáng và ca tối, p2 có
// một ca tối. Số tiền ghi sẵn, không tính từ bảng giá.
const DAY = '2026-10-04'
const at = (hour: number, minute = 0) => new Date(2026, 9, 4, hour, minute).toISOString()

const PRICES: PriceList = { firstHour: 0, nextHour: 0, overnight: 0, day: 0, week: 0, month: 0 }

const shift = (
  id: string,
  propertyId: string,
  userName: string,
  label: ShiftLabel,
  openedHour: number,
  extra: Partial<Shift> = {},
): Shift => ({
  id,
  propertyId,
  userId: `u-${userName}`,
  userName,
  label,
  businessDate: DAY,
  openedAt: at(openedHour),
  closedAt: at(openedHour === 6 ? 18 : 23, openedHour === 6 ? 0 : 59),
  cashDiff: 0,
  note: '',
  ...extra,
})

const db: Db = {
  users: [],
  properties: [],
  roomTypes: [],
  rooms: ['101', '102', '103', '201', '206'].map((number, index) => ({
    id: `p1-r${number}`,
    propertyId: 'p1',
    number,
    typeId: 'p1-type',
    floor: Number(number[0]),
    row: 1,
    col: index + 1,
    condition: 'ready' as const,
  })),
  services: [],
  stays: [],
  payments: [],
  shifts: [
    shift('morning', 'p1', 'Lan', 'Sáng', 6),
    shift('night', 'p1', 'Hùng', 'Tối', 18, { cashDiff: -50_000, note: 'Thối nhầm cho khách' }),
    shift('other', 'p2', 'Lan', 'Tối', 18),
  ],
  expenses: [
    { id: 'exp-1', propertyId: 'p1', name: 'Nhập nước uống', amount: 120_000, businessDate: DAY, at: at(10) },
    { id: 'exp-2', propertyId: 'p1', name: 'Giặt là', amount: 60_000, businessDate: DAY, at: at(16) },
  ],
}

const stay = (id: string, roomId: string, shiftId: string, extra: Partial<Stay> = {}): Stay => ({
  id,
  roomId,
  status: 'active',
  guestName: '',
  guestPhone: '',
  guestCount: 1,
  standardGuests: 2,
  extraGuestFee: 100_000,
  rentType: 'hour',
  periods: 1,
  checkInAt: at(8),
  checkOutAt: null,
  prices: PRICES,
  items: [],
  photos: [],
  notes: [],
  finalCharge: null,
  shiftId,
  checkOutShiftId: null,
  ...extra,
})

const pay = (stayId: string, amount: number, method: PaymentMethod, shiftId: string, paidAt: string) =>
  db.payments.push({ id: `pay-${db.payments.length + 1}`, stayId, amount, method, shiftId, at: paidAt })

// Lượt đã trả phòng: chốt tiền phòng và thu đủ hóa đơn trong ca trả phòng.
function done(
  roomId: string,
  shiftId: string,
  room: number,
  method: PaymentMethod,
  paidAt: string,
  items: StayItem[] = [],
) {
  const id = `stay-${db.stays.length + 1}`
  db.stays.push(
    stay(id, roomId, shiftId, { status: 'done', finalCharge: room, checkOutAt: paidAt, checkOutShiftId: shiftId, items }),
  )
  pay(id, room + items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0), method, shiftId, paidAt)
}

done('p1-r103', 'morning', 300_000, 'cash', at(7), [
  { id: 'item-1', kind: 'service', name: 'Nước suối', qty: 2, unitPrice: 10_000, shiftId: 'morning' },
])
done('p1-r101', 'morning', 110_000, 'cash', at(11))
done('p1-r201', 'morning', 140_000, 'transfer', at(14, 30))
done('p1-r102', 'night', 80_000, 'cash', at(20, 5))
done('p1-r206', 'night', 180_000, 'transfer', at(23, 10))
done('p2-r102', 'other', 100_000, 'cash', at(21))

// Một lượt đặt trước đã chuyển khoản tiền cọc trong ca tối: có tiền thu nhưng chưa có doanh thu.
db.stays.push(stay('booked', 'p1-r201', 'night', { status: 'booked', guestName: 'Anh Long' }))
pay('booked', 100_000, 'transfer', 'night', at(21))

describe('periodReport', () => {
  it('cộng thu chi của một ngày theo ca', () => {
    const { shifts, totals } = periodReport(db, 'p1', 'day', DAY)
    expect(shifts.map((row) => row.shift.label)).toEqual(['Sáng', 'Tối'])
    expect(shifts.map((row) => row.cash + row.transfer)).toEqual([570_000, 360_000])
    expect(totals).toMatchObject({ cash: 510_000, transfer: 420_000, spent: 180_000, cashDiff: -50_000 })
  })

  it('đếm lượt khách đã vào ở, không đếm lượt đặt trước', () => {
    const { shifts } = periodReport(db, 'p1', 'day', DAY)
    expect(shifts.map((row) => row.checkIns)).toEqual([3, 2])
  })

  it('không lẫn số liệu của cơ sở khác', () => {
    const { totals } = periodReport(db, 'p2', 'day', DAY)
    expect(totals.cash + totals.transfer).toBe(100_000)
  })

  it('gộp mọi cơ sở khi không chọn cơ sở nào', () => {
    const { shifts, totals } = periodReport(db, null, 'day', DAY)
    expect(shifts).toHaveLength(3)
    expect(totals.cash + totals.transfer).toBe(1_030_000)
  })

  it('tách doanh thu của các lượt đã trả phòng thành tiền phòng, dịch vụ, phụ thu', () => {
    const { revenue } = periodReport(db, 'p1', 'day', DAY)
    expect(revenue).toEqual({ stays: 5, room: 810_000, service: 20_000, surcharge: 0, discount: 0 })
  })

  it('báo cáo gộp chia được số liệu về từng cơ sở, kể cả cơ sở không có gì trong kỳ', () => {
    const groups = propertyTotals(periodReport(db, null, 'day', DAY), ['p1', 'p2', 'p3'])
    expect(groups.get('p1')).toEqual({ checkIns: 5, cash: 510_000, transfer: 420_000, spent: 180_000, cashDiff: -50_000 })
    expect(groups.get('p2')).toEqual({ checkIns: 1, cash: 100_000, transfer: 0, spent: 0, cashDiff: 0 })
    expect(groups.get('p3')).toEqual({ checkIns: 0, cash: 0, transfer: 0, spent: 0, cashDiff: 0 })
  })

  it('ghi chú mang theo cơ sở của nó', () => {
    const { notes } = periodReport(db, null, 'day', DAY)
    expect(notes).toEqual([
      { date: DAY, propertyId: 'p1', subject: 'Ca tối', by: 'Hùng', text: 'Thối nhầm cho khách' },
    ])
  })

  it('báo cáo tháng gom đúng về từng ngày', () => {
    const report = periodReport(db, 'p1', 'month', DAY)
    const days = groupTotals(report, 10)
    expect(days.get(DAY)).toMatchObject({ cash: 510_000, transfer: 420_000, spent: 180_000 })
  })
})

describe('buildReportSheets', () => {
  it('tạo được file Excel từ dữ liệu báo cáo', async () => {
    const sheets = buildReportSheets(periodReport(db, 'p1', 'day', DAY), 'day', {
      propertyName: (propertyId) => (propertyId === 'p1' ? 'Hoa Mai' : 'Bình Minh'),
      roomOf: (stayId) => {
        const found = db.stays.find((s) => s.id === stayId)
        return { room: db.rooms.find((room) => room.id === found?.roomId)?.number ?? '', guest: found?.guestName ?? '' }
      },
    })
    // Dòng khoản thu đầu tiên là lượt qua đêm của phòng 103, trả lúc 07:00.
    expect(sheets[1].data[1].slice(1, 3)).toEqual(['07:00', '103'])
    expect(sheets.map((sheet) => sheet.sheet)).toEqual([
      'Tổng hợp',
      'Khoản thu',
      'Khoản chi',
      'Cơ cấu doanh thu',
      'Ghi chú',
    ])
    // Ghi chú "thối nhầm" của ca tối, cộng dòng tiêu đề.
    expect(sheets[4].data).toHaveLength(2)
    // 5 khoản trả phòng và 1 khoản cọc, cộng dòng tiêu đề.
    expect(sheets[1].data).toHaveLength(7)

    const buffer = await writeXlsxFile(sheets).toBuffer()
    expect(buffer.length).toBeGreaterThan(0)
  })

  it('báo cáo gộp có trang Theo cơ sở và cột Cơ sở ở từng khoản', async () => {
    const names: Record<string, string> = { p1: 'Hoa Mai', p2: 'Bình Minh' }
    const sheets = buildReportSheets(periodReport(db, null, 'day', DAY), 'day', {
      propertyName: (propertyId) => names[propertyId],
      roomOf: () => ({ room: '', guest: '' }),
      properties: ['p1', 'p2'],
    })
    expect(sheets.map((sheet) => sheet.sheet)).toEqual([
      'Tổng hợp',
      'Theo cơ sở',
      'Khoản thu',
      'Khoản chi',
      'Cơ cấu doanh thu',
      'Ghi chú',
    ])
    const value = (cell: unknown) => (cell as { value: unknown }).value
    // Trang Theo cơ sở: tên, lượt, tiền mặt, chuyển khoản, tổng thu, tổng chi, còn lại, chênh lệch.
    const [, hoaMai, binhMinh, all] = sheets[1].data
    expect([hoaMai[0], ...hoaMai.slice(1).map(value)]).toEqual(['Hoa Mai', 5, 510_000, 420_000, 930_000, 180_000, 750_000, -50_000])
    expect([binhMinh[0], ...binhMinh.slice(1).map(value)]).toEqual(['Bình Minh', 1, 100_000, 0, 100_000, 0, 100_000, 0])
    expect(all.slice(1).map(value)).toEqual([6, 610_000, 420_000, 1_030_000, 180_000, 850_000, -50_000])
    // Mỗi khoản thu, khoản chi, ghi chú bắt đầu bằng tên cơ sở.
    expect(value(sheets[2].data[0][0])).toBe('Cơ sở')
    expect(sheets[2].data.slice(1).map((row) => row[0])).toContain('Bình Minh')
    expect(sheets[3].data[1][0]).toBe('Hoa Mai')
    expect(sheets[5].data[1][0]).toBe('Hoa Mai')

    const buffer = await writeXlsxFile(sheets).toBuffer()
    expect(buffer.length).toBeGreaterThan(0)
  })
})
