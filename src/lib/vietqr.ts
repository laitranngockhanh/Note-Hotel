// Tạo nội dung mã VietQR (chuẩn EMVCo của NAPAS) để khách quét là có sẵn số tiền và
// nội dung chuyển khoản. Việc xác nhận đã nhận tiền vẫn do người trực bấm tay.

// Mã BIN của các ngân hàng thường gặp. Cần quét thử bằng ứng dụng ngân hàng thật
// trước khi dùng, vì sai BIN là mã không nhận ra tài khoản.
export const BANKS: { bin: string; name: string }[] = [
  { bin: '970436', name: 'Vietcombank' },
  { bin: '970415', name: 'VietinBank' },
  { bin: '970418', name: 'BIDV' },
  { bin: '970405', name: 'Agribank' },
  { bin: '970407', name: 'Techcombank' },
  { bin: '970422', name: 'MB Bank' },
  { bin: '970416', name: 'ACB' },
  { bin: '970432', name: 'VPBank' },
  { bin: '970423', name: 'TPBank' },
  { bin: '970403', name: 'Sacombank' },
]

export const bankName = (bin: string) => BANKS.find((bank) => bank.bin === bin)?.name ?? bin

// CRC-16/CCITT-FALSE: đa thức 0x1021, giá trị đầu 0xFFFF.
export function crc16(text: string): string {
  let crc = 0xffff
  for (let i = 0; i < text.length; i += 1) {
    crc ^= text.charCodeAt(i) << 8
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

const field = (id: string, value: string) => `${id}${String(value.length).padStart(2, '0')}${value}`

// Nội dung chuyển khoản chỉ nên gồm chữ không dấu, số và dấu cách.
export function transferContent(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^A-Za-z0-9 ]/g, '')
    .trim()
    .slice(0, 25)
}

export interface VietQrInput {
  bin: string
  accountNumber: string
  amount: number
  content: string
}

export function buildVietQr({ bin, accountNumber, amount, content }: VietQrInput): string {
  const account = field('00', 'A000000727') + field('01', field('00', bin) + field('01', accountNumber)) + field('02', 'QRIBFTTA')
  const note = transferContent(content)
  const body =
    field('00', '01') +
    // 12 là mã dùng một lần có sẵn số tiền, 11 là mã tĩnh.
    field('01', amount > 0 ? '12' : '11') +
    field('38', account) +
    field('53', '704') +
    (amount > 0 ? field('54', String(Math.round(amount))) : '') +
    field('58', 'VN') +
    (note ? field('62', field('08', note)) : '') +
    '6304'
  return body + crc16(body)
}
