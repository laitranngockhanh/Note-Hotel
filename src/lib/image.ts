// Thu nhỏ ảnh trước khi lưu. Ảnh chụp từ điện thoại nặng vài MB; thu cạnh dài về
// MAX_SIDE điểm ảnh thì còn vài trăm KB mà chữ trên giấy tờ vẫn đọc rõ.

const MAX_SIDE = 1600
const JPEG_QUALITY = 0.75

export async function compressImage(file: Blob): Promise<Blob> {
  // from-image để ảnh chụp dọc từ điện thoại không bị xoay ngang.
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)

  const context = canvas.getContext('2d')
  if (!context) throw new Error('Không tạo được vùng vẽ')
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Không xuất được ảnh'))),
      'image/jpeg',
      JPEG_QUALITY,
    )
  })
}
