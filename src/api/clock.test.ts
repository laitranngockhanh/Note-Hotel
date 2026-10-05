import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { onClockSync, serverNow, syncClock } from './clock'

// Giờ của máy này trong các kiểm thử dưới đây.
const DEVICE = new Date('2026-10-05T08:00:00.000Z').getTime()

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(DEVICE)
})
afterEach(() => {
  // Trả đồng hồ về trạng thái chưa lệch cho các kiểm thử khác.
  syncClock(new Date(Date.now()).toISOString(), Date.now(), Date.now())
  vi.useRealTimers()
})

describe('đồng hồ theo máy chủ', () => {
  it('máy này chạy nhanh 5 phút: giờ dùng để tính tiền vẫn là giờ máy chủ', () => {
    syncClock('2026-10-05T07:55:00.000Z', DEVICE, DEVICE)
    expect(serverNow().toISOString()).toBe('2026-10-05T07:55:00.000Z')

    // Thời gian vẫn trôi bình thường sau khi đã chỉnh.
    vi.advanceTimersByTime(90_000)
    expect(serverNow().toISOString()).toBe('2026-10-05T07:56:30.000Z')
  })

  it('trừ bớt thời gian đi đường bằng điểm giữa lúc gửi và lúc nhận', () => {
    // Gửi lúc 08:00:00, nhận lúc 08:00:02; máy chủ trả lời lúc 09:00:01 theo giờ của nó.
    vi.setSystemTime(DEVICE + 2_000)
    syncClock('2026-10-05T09:00:01.000Z', DEVICE, DEVICE + 2_000)
    expect(serverNow().toISOString()).toBe('2026-10-05T09:00:02.000Z')
  })

  it('báo cho màn hình mỗi lần chỉnh, và bỏ qua giờ không đọc được', () => {
    const listener = vi.fn()
    const stop = onClockSync(listener)
    syncClock('2026-10-05T07:55:00.000Z', DEVICE, DEVICE)
    expect(listener).toHaveBeenCalledTimes(1)

    syncClock('không phải giờ', DEVICE, DEVICE)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(serverNow().toISOString()).toBe('2026-10-05T07:55:00.000Z')

    stop()
    syncClock('2026-10-05T07:55:00.000Z', DEVICE, DEVICE)
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
