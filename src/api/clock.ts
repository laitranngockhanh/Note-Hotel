// Đồng hồ dùng cho mọi phép tính trên màn hình: thời gian đã ở, tiền tạm tính, quá hạn, trễ
// hẹn. Nó chạy theo giờ của máy chủ chứ không theo giờ của máy đang mở giao diện, vì máy chủ
// là nơi chốt giờ trả phòng và tiền phòng; hai bên dùng hai đồng hồ thì số tiền hiện ra có thể
// khác số tiền ghi sổ. Mỗi lần tải dữ liệu, máy chủ gửi kèm giờ của nó và độ lệch được tính lại.

let offsetMs = 0
const listeners = new Set<() => void>()

// sentAt và receivedAt là giờ của máy này lúc gửi yêu cầu và lúc nhận trả lời; lấy điểm giữa
// để trừ bớt thời gian đi đường.
export function syncClock(serverTime: string, sentAt: number, receivedAt: number): void {
  const server = new Date(serverTime).getTime()
  if (Number.isNaN(server)) return
  offsetMs = server - (sentAt + receivedAt) / 2
  listeners.forEach((listener) => listener())
}

// Giờ hiện tại theo máy chủ.
export function serverNow(): Date {
  return new Date(Date.now() + offsetMs)
}

// Gọi lại mỗi khi đồng hồ vừa được chỉnh, để màn hình tính lại ngay thay vì chờ nhịp sau.
export function onClockSync(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
