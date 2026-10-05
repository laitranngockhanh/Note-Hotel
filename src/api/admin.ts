import type { BankAccount, Role } from '../types'
import { api } from './http'
import { attempt } from './store'

// Quản lý tài khoản, cơ sở và sơ đồ: các thao tác mà form tự hiện lỗi ngay cạnh ô nhập.
// Mỗi hàm trả về câu báo lỗi của máy chủ khi thao tác không hợp lệ, hoặc null khi đã xong.
// Quy tắc (PIN không trùng, luôn còn một chủ, không xóa thứ đã có dữ liệu…) nằm ở máy chủ.

const id = encodeURIComponent

// ----- Nhân viên và mã PIN -----

export const addUser = (name: string, role: Role, pin: string) =>
  attempt(() => api('POST', '/users', { name, role, pin }))

// newPin để trống nghĩa là giữ PIN cũ.
export const updateUser = (userId: string, name: string, role: Role, newPin: string) =>
  attempt(() => api('PATCH', `/users/${id(userId)}`, { name, role, ...(newPin ? { pin: newPin } : {}) }))

export const setUserActive = (userId: string, active: boolean) =>
  attempt(() => api('PATCH', `/users/${id(userId)}`, { active }))

export const deleteUser = (userId: string) => attempt(() => api('DELETE', `/users/${id(userId)}`))

// Chủ xem PIN của một người để nhắc lại khi họ quên. Danh sách tài khoản không bao giờ kèm
// PIN, nên phải hỏi riêng từng người.
export async function getUserPin(userId: string): Promise<string | null> {
  try {
    return (await api<{ pin: string }>('GET', `/users/${id(userId)}/pin`)).pin
  } catch {
    return null
  }
}

// ----- Cơ sở -----

const patchProperty = (propertyId: string, body: object) =>
  attempt(() => api('PATCH', `/properties/${id(propertyId)}`, body))

export const renameProperty = (propertyId: string, name: string) => patchProperty(propertyId, { name })

// Ngừng hoạt động: cơ sở biến mất khỏi màn chọn cơ sở nhưng lịch sử và báo cáo vẫn còn.
export const setPropertyActive = (propertyId: string, active: boolean) => patchProperty(propertyId, { active })

export const deleteProperty = (propertyId: string) => attempt(() => api('DELETE', `/properties/${id(propertyId)}`))

// Quyền của người trực ở một cơ sở. staffIds là null thì mọi người trực đều làm được ở đây.
export const setPropertyAccess = (propertyId: string, staffIds: string[] | null, staffCanEditPrice: boolean) =>
  patchProperty(propertyId, { staffIds, staffCanEditPrice })

// Tài khoản nhận chuyển khoản; null là bỏ, màn hình thanh toán sẽ không hiện mã QR.
export const setPropertyBank = (propertyId: string, bank: BankAccount | null) =>
  patchProperty(propertyId, { bank: bank ? { ...bank, accountName: bank.accountName.trim() } : null })

// ----- Thứ chỉ xóa được khi chưa có dữ liệu -----

export const deleteRoom = (roomId: string) => attempt(() => api('DELETE', `/rooms/${id(roomId)}`))
export const deleteRoomType = (typeId: string) => attempt(() => api('DELETE', `/room-types/${id(typeId)}`))
