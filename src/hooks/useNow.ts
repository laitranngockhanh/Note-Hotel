import { useEffect, useState } from 'react'
import { onClockSync, serverNow } from '../api/clock'

// Thời điểm hiện tại theo đồng hồ máy chủ, tự cập nhật để thời gian đã ở và tiền tạm tính
// không đứng yên. Cập nhật theo nhịp, và ngay sau mỗi lần tải dữ liệu từ máy chủ.
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(serverNow)

  useEffect(() => {
    const tick = () => setNow(serverNow())
    const timer = setInterval(tick, intervalMs)
    const unsubscribe = onClockSync(tick)
    return () => {
      clearInterval(timer)
      unsubscribe()
    }
  }, [intervalMs])

  return now
}
