import { compressImage } from '../lib/image'
import type { ReportMode, PeriodReport } from '../lib/report'
import type {
  Db,
  ItemKind,
  Payment,
  PaymentMethod,
  PriceList,
  RentType,
  Role,
  RoomCondition,
  RoomType,
  Service,
  Settings,
  Shift,
  Stay,
  StayStatus,
} from '../types'
import { api, apiBlob, ApiError, apiUpload } from './http'
import {
  attempt,
  getState,
  loadPropertyNames,
  markSetUp,
  messageOf,
  refresh,
  run,
  setProperty,
  setSession,
} from './store'

// Lớp truy cập dữ liệu. Màn hình chỉ gọi các hàm ở đây; mỗi hàm là một lệnh gọi tới máy chủ
// (thư mục ../Be). Thao tác xong thì dữ liệu trên màn hình tự làm mới; thao tác thất bại thì
// lỗi hiện ở thanh thông báo chung.

export * from './admin'
export { loadPropertyNames, loadSetup, refresh, setError, useApp, useDb } from './store'
export type { PropertyName, SetupStatus } from './store'

export { serverNow } from './clock'

export const PIN_LENGTH = 4
export const MAX_STAY_PHOTOS = 6

const id = encodeURIComponent

// ----- Đăng nhập và cơ sở -----

interface LoginResponse {
  token: string
  user: { id: string; name: string; role: Role }
}

// Đăng nhập bằng PIN vào một cơ sở. Trả về câu báo lỗi của máy chủ (sai PIN, đang bị khóa,
// chưa được phân công…), hoặc null khi đã vào được.
export async function login(pin: string, propertyId: string): Promise<string | null> {
  try {
    const body = await api<LoginResponse>('POST', '/login', { pin, propertyId })
    setSession({ userId: body.user.id, name: body.user.name, role: body.user.role }, body.token)
    await refresh()
    return null
  } catch (error) {
    return messageOf(error)
  }
}

export interface SetupInput {
  ownerName: string
  propertyName: string
  pin: string
  code?: string
}

// Cài đặt lần đầu: tạo chủ sở hữu với mã PIN tự chọn và nhà nghỉ đầu tiên, rồi vào thẳng ứng
// dụng. Trả về câu báo lỗi của máy chủ, hoặc null khi đã xong.
export async function setupOwner(input: SetupInput): Promise<string | null> {
  try {
    const body = await api<LoginResponse & { propertyId: string }>('POST', '/setup', input)
    setProperty(body.propertyId)
    setSession({ userId: body.user.id, name: body.user.name, role: body.user.role }, body.token)
    await Promise.all([loadPropertyNames(), refresh()])
    markSetUp()
    return null
  } catch (error) {
    return messageOf(error)
  }
}

// Khóa màn hình: kết thúc phiên trên máy chủ rồi quay về màn nhập PIN. Ca vẫn mở.
export function logout(): void {
  // Báo máy chủ hủy phiên; không cần chờ, và không sao nếu mất mạng lúc này.
  void api('POST', '/logout').catch(() => {})
  setSession(null, null)
}

// Cơ sở đang chọn được nhớ theo máy, vì máy ở quầy thường chỉ dùng cho một cơ sở.
export function chooseProperty(propertyId: string): void {
  setProperty(propertyId)
  void refresh()
}

export const addProperty = (name: string, copyFromId: string | undefined) =>
  run(async () => (await api<{ id: string }>('POST', '/properties', { name, copyFromId })).id)

// ----- Ca -----

// Mỗi cơ sở chỉ có một ca mở tại một thời điểm.
export function openShiftOf(db: Db, propertyId: string): Shift | null {
  return db.shifts.find((shift) => shift.propertyId === propertyId && shift.closedAt === null) ?? null
}

export const startShift = (propertyId: string) => run(() => api('POST', '/shifts/start', { propertyId }))

export const closeShift = (shiftId: string, cashDiff: number, note: string) =>
  run(() => api('POST', `/shifts/${id(shiftId)}/close`, { cashDiff, note }))

// ----- Lượt thuê -----

export interface CheckInInput {
  roomId: string
  rentType: RentType
  periods: number
  prices: PriceList
  guestName: string
  guestPhone: string
  guestCount: number
}

export interface BookingInput extends CheckInInput {
  expectedAt: string
  deposit: number
  depositMethod: PaymentMethod
}

// Trả về mã lượt thuê vừa tạo, để gắn ảnh giấy tờ đã chọn sẵn trong form.
export const checkIn = (input: CheckInInput) =>
  run(async () => (await api<{ id: string }>('POST', '/stays/check-in', input)).id)

export const bookRoom = (input: BookingInput) =>
  run(async () => (await api<{ id: string }>('POST', '/stays/book', input)).id)

export const arriveBooking = (stayId: string) => run(() => api('POST', `/stays/${id(stayId)}/arrive`))

// Có refundMethod thì hoàn lại toàn bộ tiền cọc; không có thì giữ cọc.
export const cancelBooking = (stayId: string, refundMethod?: PaymentMethod) =>
  run(() => api('POST', `/stays/${id(stayId)}/cancel`, { refundMethod }))

// Trả phòng. expectedDue là số tiền đang hiện trên màn hình; máy chủ tự tính lại và từ chối nếu
// hai số khác nhau. Trả về null khi đã xong, hoặc câu báo của máy chủ khi bị từ chối; lúc đó
// dữ liệu và đồng hồ được tải lại để màn hình hiện số mới.
export async function checkOut(stayId: string, method: PaymentMethod, expectedDue: number): Promise<string | null> {
  const refused = await attempt(() => api('POST', `/stays/${id(stayId)}/check-out`, { method, expectedDue }))
  if (refused) await refresh()
  return refused
}

const patchStay = (stayId: string, body: object) => run(() => api('PATCH', `/stays/${id(stayId)}`, body))

export const setGuestInfo = (stayId: string, guestName: string, guestPhone: string) =>
  patchStay(stayId, { guestName, guestPhone })
export const setGuestCount = (stayId: string, guestCount: number) =>
  patchStay(stayId, { guestCount: Math.max(1, guestCount) })
export const setBookingTime = (stayId: string, expectedAt: string) => patchStay(stayId, { expectedAt })
// Đổi kiểu thuê: tiền tính lại từ giờ vào theo kiểu mới.
export const changeRentType = (stayId: string, rentType: RentType) => patchStay(stayId, { rentType })

export const extendStay = (stayId: string) => run(() => api('POST', `/stays/${id(stayId)}/extend`))
export const moveStay = (stayId: string, roomId: string) =>
  run(() => api('POST', `/stays/${id(stayId)}/move`, { roomId }))

export const addItem = (stayId: string, kind: ItemKind, name: string, unitPrice: number) =>
  run(() => api('POST', `/stays/${id(stayId)}/items`, { kind, name, unitPrice }))
export const removeItem = (stayId: string, itemId: string) =>
  run(() => api('DELETE', `/stays/${id(stayId)}/items/${id(itemId)}`))

export const addPayment = (stayId: string, amount: number, method: PaymentMethod) =>
  run(() => api('POST', `/stays/${id(stayId)}/payments`, { amount, method }))
// Bỏ một khoản thu nhập nhầm; máy chủ chỉ cho bỏ khi ca ghi nó còn mở.
export const removePayment = (paymentId: string) => run(() => api('DELETE', `/payments/${id(paymentId)}`))

export const addStayNote = (stayId: string, text: string) =>
  run(() => api('POST', `/stays/${id(stayId)}/notes`, { text }))
export const addShiftNote = (shiftId: string, text: string) =>
  run(() => api('POST', `/shifts/${id(shiftId)}/notes`, { text }))

export const setRoomCondition = (roomId: string, condition: RoomCondition) =>
  run(() => api('POST', `/rooms/${id(roomId)}/condition`, { condition }))

// Danh sách lượt thuê theo trạng thái, kèm các khoản thu của chúng.
export interface StayList {
  stays: Stay[]
  payments: Payment[]
  // Tên người trực của ca đã ghi từng khoản thu, theo mã ca.
  collectors: Record<string, string>
}

export function fetchStays(propertyId: string, status: StayStatus, query: string): Promise<StayList> {
  const search = query.trim() ? `&q=${id(query.trim())}` : ''
  return api<StayList>('GET', `/stays?propertyId=${id(propertyId)}&status=${status}${search}`)
}

// ----- Ảnh giấy tờ -----

// Kiểm tra và thu nhỏ một ảnh người dùng vừa chọn. Làm ngay lúc chọn để ảnh hỏng báo lỗi
// tại chỗ, trước khi lượt thuê được tạo.
export async function preparePhoto(file: File): Promise<{ blob: Blob } | { error: string }> {
  if (!file.type.startsWith('image/')) return { error: `${file.name} không phải file ảnh.` }
  try {
    return { blob: await compressImage(file) }
  } catch {
    return { error: `Không đọc được ảnh ${file.name}. Thử ảnh khác.` }
  }
}

export const attachPhoto = (stayId: string, blob: Blob) =>
  run(() => apiUpload(`/stays/${id(stayId)}/photos`, blob))
export const removePhoto = (stayId: string, photoId: string) =>
  run(() => api('DELETE', `/stays/${id(stayId)}/photos/${id(photoId)}`))

// Ảnh chỉ tải được khi đã đăng nhập, nên phải lấy qua lệnh gọi có mã phiên chứ không gắn
// thẳng đường dẫn vào thẻ ảnh.
export async function getPhoto(photoId: string): Promise<Blob | null> {
  try {
    return await apiBlob(`/photos/${id(photoId)}`)
  } catch (error) {
    if (error instanceof ApiError) return null
    throw error
  }
}

// ----- Báo cáo và khoản chi (chỉ chủ) -----

export interface ReportData {
  report: PeriodReport
  stays: { id: string; roomId: string; guestName: string }[]
  rooms: { id: string; number: string; propertyId: string }[]
  properties: { id: string; name: string }[]
}

// propertyId là null thì gộp mọi cơ sở.
export function fetchReport(propertyId: string | null, mode: ReportMode, date: string): Promise<ReportData> {
  const scope = propertyId ? `propertyId=${id(propertyId)}&` : ''
  return api<ReportData>('GET', `/reports?${scope}mode=${mode}&date=${date}`)
}

export const addExpense = (propertyId: string, name: string, amount: number, businessDate: string) =>
  run(() => api('POST', '/expenses', { propertyId, name, amount, businessDate }))
export const removeExpense = (expenseId: string) => run(() => api('DELETE', `/expenses/${id(expenseId)}`))

// ----- Sơ đồ phòng, loại phòng, dịch vụ (chỉ chủ) -----

export interface RoomPosition {
  floor: number
  row: number
  col: number
}

export const addRoom = (propertyId: string, number: string, typeId: string, position: RoomPosition) =>
  run(() => api('POST', '/rooms', { propertyId, number, typeId, ...position }))
export const updateRoom = (roomId: string, number: string, typeId: string) =>
  run(() => api('PATCH', `/rooms/${id(roomId)}`, { number, typeId }))
export const moveRoom = (roomId: string, position: RoomPosition) =>
  run(() => api('PATCH', `/rooms/${id(roomId)}`, position))

const roomTypeBody = ({ name, standardGuests, extraGuestFee, prices }: RoomType) => ({
  name,
  standardGuests,
  extraGuestFee,
  prices,
})

// Đổi bảng giá chỉ ảnh hưởng lượt thuê mới; lượt đang ở giữ giá đã chốt.
export const saveRoomType = (type: RoomType) => run(() => api('PUT', `/room-types/${id(type.id)}`, roomTypeBody(type)))

// Loại phòng mới bắt đầu bằng bản chép của loại đầu tiên, rồi chủ sửa lại.
export function addRoomType(propertyId: string) {
  const base = getState().db.roomTypes.find((type) => type.propertyId === propertyId)
  return run(() =>
    api<{ id: string }>('POST', '/room-types', {
      propertyId,
      name: 'Loại phòng mới',
      standardGuests: base?.standardGuests ?? 2,
      extraGuestFee: base?.extraGuestFee ?? 0,
      prices: base?.prices ?? { firstHour: 0, nextHour: 0, overnight: 0, day: 0, week: 0, month: 0 },
    }),
  )
}

export const saveService = ({ id: serviceId, name, price }: Service) =>
  run(() => api('PUT', `/services/${id(serviceId)}`, { name, price }))
export const addService = (propertyId: string, name: string, price: number) =>
  run(() => api('POST', '/services', { propertyId, name, price }))
export const deleteService = (serviceId: string) => run(() => api('DELETE', `/services/${id(serviceId)}`))

export const updateSettings = (propertyId: string, settings: Settings) =>
  run(() => api('PATCH', `/properties/${id(propertyId)}`, { settings }))
