import { describe, expect, it } from 'vitest'
import { buildVietQr, crc16, transferContent } from './vietqr'

describe('crc16', () => {
  it('khớp giá trị kiểm tra chuẩn của CRC-16/CCITT-FALSE', () => {
    expect(crc16('123456789')).toBe('29B1')
  })
})

describe('transferContent', () => {
  it('bỏ dấu tiếng Việt và ký tự đặc biệt', () => {
    expect(transferContent('Phòng 102 – Đặt cọc!')).toBe('Phong 102  Dat coc')
  })
})

describe('buildVietQr', () => {
  const payload = buildVietQr({ bin: '970436', accountNumber: '0123456789', amount: 130_000, content: 'P102 AB12' })

  it('có đủ các trường theo đúng thứ tự', () => {
    expect(payload).toBe(
      '000201' +
        '010212' +
        '38540010A000000727' +
        '0124' +
        '0006970436' +
        '01100123456789' +
        '0208QRIBFTTA' +
        '5303704' +
        '5406130000' +
        '5802VN' +
        '62130809P102 AB12' +
        '6304' +
        payload.slice(-4),
    )
  })

  it('kết thúc bằng CRC của phần đứng trước', () => {
    expect(payload.slice(-4)).toBe(crc16(payload.slice(0, -4)))
  })

  it('không có số tiền thì là mã tĩnh và bỏ trường số tiền', () => {
    const fixed = buildVietQr({ bin: '970436', accountNumber: '0123456789', amount: 0, content: '' })
    expect(fixed).toContain('010211')
    expect(fixed).not.toContain('5406')
    expect(fixed).not.toContain('6213')
  })
})
