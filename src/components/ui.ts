export const btn =
  'rounded-lg bg-white px-3 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-200 active:bg-slate-100'

export const btnPrimary =
  'rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white active:bg-slate-700'

// Chữ trong ô nhập là 16px trên điện thoại: nhỏ hơn thì Safari trên iPhone tự phóng to trang mỗi
// lần bấm vào ô.
export const input =
  'w-full rounded-lg bg-white px-3 py-2 text-base text-slate-800 sm:text-sm ring-1 ring-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-500'

// Nút ✕ nhỏ để bỏ một dòng (dịch vụ, khoản thu, khoản chi). Chữ nhỏ nhưng vùng bấm đủ lớn cho ngón tay.
export const removeButton = 'ml-1 rounded-lg px-2.5 py-1.5 text-slate-400 active:bg-slate-200'

export const fieldLabel = 'mb-1 block text-xs font-medium text-slate-500'

// Sơ đồ một tầng, dùng chung cho màn sơ đồ phòng và màn sửa sơ đồ. Mỗi ô phòng rộng ít nhất
// 4.5rem để còn đọc được; tầng có nhiều phòng hơn bề ngang màn hình thì kéo ngang, cả các
// dãy của tầng cùng trượt một lượt. Trên điện thoại vừa đúng 4 ô một dãy.
export const floorScroll = 'overflow-x-auto pb-1'
export const floorBody = 'w-max min-w-full'
export const floorColumns = (cols: number) => `repeat(${cols}, minmax(4.5rem, 1fr))`
