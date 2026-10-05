import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Property, Role } from '../types'

vi.mock('./http', () => ({
  api: vi.fn(),
  ApiError: class extends Error {},
  hasToken: () => false,
  setToken: vi.fn(),
}))

import { api } from './http'
import { getState, loadPropertyNames, refresh, setProperty, setSession } from './store'

const property = (id: string, name: string, active = true) => ({ id, name, active }) as Property

// Máy chủ giả: danh sách tên công khai và bản chụp của cơ sở đang mở.
let publicNames: Promise<{ id: string; name: string }[]>
let properties: Property[]

async function loginAs(role: Role) {
  setProperty('a')
  setSession({ userId: 'u1', name: 'Tâm', role }, 'ma-phien')
  await refresh()
}

beforeEach(async () => {
  properties = [property('a', 'Cây Khế')]
  publicNames = Promise.resolve([{ id: 'a', name: 'Cây Khế' }])
  vi.mocked(api).mockImplementation(async (_method: string, path: string) => {
    if (path === '/properties/public') return publicNames
    return { user: { id: 'u1', name: 'Tâm', role: getState().session!.role }, properties, users: [], roomTypes: [], rooms: [], services: [], stays: [], payments: [], shift: null }
  })
  await loadPropertyNames()
})

describe('danh sách cơ sở ở màn nhập PIN', () => {
  it('chủ thêm cơ sở rồi khóa máy: cơ sở mới có ngay, không chờ máy chủ và không cần tải lại trang', async () => {
    await loginAs('owner')
    properties = [...properties, property('b', 'Hải Sơn'), property('c', 'Đã ngừng', false)]
    await refresh()

    // Lần hỏi lại máy chủ chưa trả lời.
    publicNames = new Promise(() => {})
    setSession(null, null)

    expect(getState().propertyNames).toEqual([
      { id: 'a', name: 'Cây Khế' },
      { id: 'b', name: 'Hải Sơn' },
    ])
  })

  it('người trực khóa máy: hỏi lại máy chủ để thấy cơ sở chủ vừa thêm từ máy khác', async () => {
    await loginAs('staff')
    publicNames = Promise.resolve([
      { id: 'a', name: 'Cây Khế' },
      { id: 'b', name: 'Hải Sơn' },
    ])
    setSession(null, null)
    expect(getState().propertyNames).toHaveLength(1)

    await vi.waitFor(() => expect(getState().propertyNames).toHaveLength(2))
  })

  it('mất mạng lúc hỏi lại thì giữ danh sách cũ và không báo lỗi', async () => {
    await loginAs('staff')
    publicNames = Promise.reject(new Error('mất mạng'))
    setSession(null, null)
    await loadPropertyNames(true)

    expect(getState().propertyNames).toEqual([{ id: 'a', name: 'Cây Khế' }])
    expect(getState().error).toBe('')
  })
})
