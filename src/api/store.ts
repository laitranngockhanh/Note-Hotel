import { useSyncExternalStore } from 'react'
import type { Db, Payment, Property, Role, Room, RoomType, Service, Session, Shift, Stay } from '../types'
import { syncClock } from './clock'
import { api, ApiError, hasToken, setToken } from './http'

// Trạng thái phía trình duyệt: ai đang đăng nhập, máy thuộc cơ sở nào, và bản chụp dữ liệu
// của cơ sở đó lấy từ máy chủ. Bản chụp được làm mới sau mỗi thao tác và theo chu kỳ, để
// nhiều máy cùng thấy một trạng thái.

const SESSION_KEY = 'hotel.session'
const PROPERTY_KEY = 'hotel.property'
const REFRESH_MS = 10_000

export interface PropertyName {
  id: string
  name: string
}

// Hệ thống mới cài chưa có tài khoản nào thì phải qua bước tạo chủ sở hữu trước.
export interface SetupStatus {
  needsSetup: boolean
  // Máy chủ có đặt mã cài đặt hay không; có thì phải hỏi mã ở bước tạo chủ.
  codeRequired: boolean
}

export interface AppState {
  // null khi chưa hỏi được máy chủ.
  setup: SetupStatus | null
  session: Session | null
  propertyId: string | null
  // Tên các cơ sở đang hoạt động; null khi chưa tải được.
  propertyNames: PropertyName[] | null
  db: Db
  // Đã có bản chụp của cơ sở đang chọn hay chưa.
  loaded: boolean
  // Lỗi gần nhất của một thao tác, để hiện cho người dùng.
  error: string
  // Máy này đang đặt múi giờ khác múi giờ của máy chủ (giờ Việt Nam).
  zoneMismatch: boolean
}

const EMPTY_DB: Db = {
  users: [],
  properties: [],
  roomTypes: [],
  rooms: [],
  services: [],
  stays: [],
  payments: [],
  shifts: [],
  expenses: [],
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // Không lưu được thì vẫn chạy, chỉ mất lựa chọn khi tải lại trang.
  }
}

function readSession(): Session | null {
  try {
    const raw = read(SESSION_KEY)
    return raw && hasToken() ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

let state: AppState = {
  setup: null,
  session: readSession(),
  propertyId: read(PROPERTY_KEY),
  propertyNames: null,
  db: EMPTY_DB,
  loaded: false,
  error: '',
  zoneMismatch: false,
}

const listeners = new Set<() => void>()

function set(partial: Partial<AppState>): void {
  state = { ...state, ...partial }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const getState = () => state

export function useApp(): AppState {
  return useSyncExternalStore(subscribe, getState)
}

export function useDb(): Db {
  return useApp().db
}

export const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : 'Có lỗi xảy ra. Thử lại.'

export function setError(error: string): void {
  set({ error })
}

export function setSession(session: Session | null, token: string | null): void {
  setToken(token)
  write(SESSION_KEY, session ? JSON.stringify(session) : null)
  // Chủ có thể vừa thêm, đổi tên hoặc ngừng một cơ sở. Khi chủ khóa máy, màn nhập PIN phải
  // thấy ngay danh sách mới, nên chép từ bản chụp của chủ trước khi xóa nó.
  const { propertyNames, db, loaded } = state
  const fresh =
    !session && state.session?.role === 'owner' && loaded
      ? db.properties.filter((property) => property.active).map(({ id, name }) => ({ id, name }))
      : propertyNames
  set({ session, db: EMPTY_DB, loaded: false, propertyNames: fresh })
  // Người trực không có danh sách đó, nên vẫn hỏi lại máy chủ.
  if (!session) void loadPropertyNames(true)
}

export function setProperty(propertyId: string | null): void {
  write(PROPERTY_KEY, propertyId)
  set({ propertyId, db: EMPTY_DB, loaded: false })
}

// Dữ liệu máy chủ trả về cho màn hình chính.
interface StateResponse {
  // Giờ của máy chủ lúc trả lời, và độ lệch múi giờ của nó so với UTC tính bằng phút.
  now: string
  utcOffsetMinutes: number
  user: { id: string; name: string; role: Role }
  properties: Property[]
  users: { id: string; name: string; role: Role; active: boolean }[]
  roomTypes: RoomType[]
  rooms: Room[]
  services: Service[]
  stays: Stay[]
  payments: Payment[]
  shift: Shift | null
}

// Lấy bản chụp mới nhất của cơ sở đang chọn. Trả về false nếu không lấy được.
export async function refresh(): Promise<boolean> {
  const { session, propertyId } = state
  if (!session || !propertyId) return false
  try {
    const sentAt = Date.now()
    const body = await api<StateResponse>('GET', `/state?propertyId=${encodeURIComponent(propertyId)}`)
    // Chỉnh đồng hồ trước khi cập nhật dữ liệu, để màn hình tính tiền bằng đúng giờ máy chủ.
    syncClock(body.now, sentAt, Date.now())
    // Trong lúc chờ, người dùng có thể đã khóa máy hoặc đổi cơ sở; khi đó bỏ kết quả này.
    if (state.session?.userId !== session.userId || state.propertyId !== propertyId) return false
    set({
      loaded: true,
      zoneMismatch:
        typeof body.utcOffsetMinutes === 'number' && body.utcOffsetMinutes !== -new Date().getTimezoneOffset(),
      // Tên và vai trò lấy theo máy chủ, để việc chủ đổi tên hay đổi vai trò có hiệu lực ngay.
      session: { userId: body.user.id, name: body.user.name, role: body.user.role },
      db: {
        // Máy chủ không bao giờ gửi mã PIN trong danh sách; muốn xem phải hỏi riêng từng người.
        users: body.users.map((user) => ({ ...user, pin: '' })),
        properties: body.properties,
        roomTypes: body.roomTypes,
        rooms: body.rooms,
        services: body.services,
        stays: body.stays,
        payments: body.payments,
        shifts: body.shift ? [body.shift] : [],
        expenses: [],
      },
    })
    return true
  } catch (error) {
    // Phiên hết hạn, tài khoản bị ngừng, hoặc bị gỡ khỏi cơ sở: quay về màn nhập PIN.
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      setSession(null, null)
      set({ error: error.status === 403 ? error.message : '' })
    } else if (!state.loaded) {
      set({ error: messageOf(error) })
    }
    return false
  }
}

// quiet: lần lấy lại ngầm, thất bại thì giữ danh sách cũ và không báo lỗi.
export async function loadPropertyNames(quiet = false): Promise<void> {
  try {
    set({ propertyNames: await api<PropertyName[]>('GET', '/properties/public') })
  } catch (error) {
    if (!quiet) set({ error: messageOf(error) })
  }
}

export async function loadSetup(): Promise<void> {
  try {
    set({ setup: await api<SetupStatus>('GET', '/setup') })
  } catch (error) {
    set({ error: messageOf(error) })
  }
}

// Chủ sở hữu vừa được tạo trên máy này: không cần hỏi lại máy chủ.
export function markSetUp(): void {
  set({ setup: { needsSetup: false, codeRequired: false } })
}

// Chạy một thao tác rồi làm mới dữ liệu. Thao tác thất bại thì hiện lỗi và trả về undefined,
// để chỗ gọi không phải tự bắt lỗi.
export async function run<T>(action: () => Promise<T>): Promise<T | undefined> {
  try {
    const result = await action()
    await refresh()
    return result
  } catch (error) {
    set({ error: messageOf(error) })
    await refresh()
    return undefined
  }
}

// Như run, nhưng dành cho các form quản lý tự hiện lỗi ngay cạnh ô nhập: trả về câu báo lỗi,
// hoặc null khi đã xong.
export async function attempt(action: () => Promise<unknown>): Promise<string | null> {
  try {
    await action()
    await refresh()
    return null
  } catch (error) {
    return messageOf(error)
  }
}

// Làm mới định kỳ khi trang đang được nhìn, để thấy thay đổi từ máy khác. Đang đăng nhập thì
// lấy lại bản chụp; đang ở màn chọn cơ sở hoặc nhập PIN thì lấy lại tên các cơ sở.
if (typeof window !== 'undefined') {
  const sync = () => {
    if (document.visibilityState !== 'visible') return
    if (state.session) void refresh()
    else if (state.propertyNames) void loadPropertyNames(true)
  }
  window.setInterval(sync, REFRESH_MS)
  document.addEventListener('visibilitychange', sync)
}
