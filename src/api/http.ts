// Gọi API của máy chủ (thư mục ../Be). Địa chỉ lấy từ VITE_API_URL. Không đặt thì mặc định là
// cổng 3000 (hoặc VITE_API_PORT) trên chính máy đang phục vụ giao diện, nên mở từ điện thoại
// cùng wifi (http://<địa chỉ máy tính>:5173) cũng gọi đúng máy chủ.

const HOST = typeof window === 'undefined' ? 'localhost' : window.location.hostname
const PORT = (import.meta.env.VITE_API_PORT as string | undefined) || '3000'
const BASE = (import.meta.env.VITE_API_URL as string | undefined) || `http://${HOST}:${PORT}/api`
const TOKEN_KEY = 'hotel.token'

// Lỗi do máy chủ trả về, kèm câu báo tiếng Việt để hiện thẳng cho người dùng.
// status = 0 nghĩa là không kết nối được máy chủ.
export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

let token = readToken()

export function setToken(next: string | null): void {
  token = next
  try {
    if (next === null) localStorage.removeItem(TOKEN_KEY)
    else localStorage.setItem(TOKEN_KEY, next)
  } catch {
    // Không lưu được thì vẫn chạy, chỉ phải đăng nhập lại khi tải lại trang.
  }
}

export const hasToken = () => token !== null

async function send(method: string, path: string, init: RequestInit): Promise<Response> {
  let response: Response
  try {
    response = await fetch(`${BASE}${path}`, {
      ...init,
      method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers },
    })
  } catch {
    throw new ApiError(0, 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.')
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null
    throw new ApiError(response.status, body?.error ?? 'Máy chủ gặp lỗi. Thử lại sau.')
  }
  return response
}

export async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const init: RequestInit =
    body === undefined ? {} : { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }
  return (await send(method, path, init)).json() as Promise<T>
}

// Tải một ảnh lên: thân yêu cầu là chính file ảnh.
export async function apiUpload<T = unknown>(path: string, blob: Blob): Promise<T> {
  return (await send('POST', path, { body: blob, headers: { 'Content-Type': blob.type } })).json() as Promise<T>
}

export async function apiBlob(path: string): Promise<Blob> {
  return (await send('GET', path, {})).blob()
}
