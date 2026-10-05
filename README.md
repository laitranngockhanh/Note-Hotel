# FE quản lý nhà nghỉ

Giao diện web cho ứng dụng quản lý nhà nghỉ nhỏ, nơi chủ thường kiêm lễ tân. Ưu tiên dùng trên điện thoại, chạy được cả trên máy tính ở quầy.

Giao diện không tự lưu dữ liệu: mọi thứ nằm ở máy chủ trong thư mục `../Be`. Trình duyệt chỉ nhớ ba thứ: máy thuộc cơ sở nào, mã phiên đăng nhập, và tên người đang đăng nhập.

## Mục lục

1. [Chạy trên máy](#chạy-trên-máy)
2. [Công nghệ](#công-nghệ)
3. [Luồng sử dụng](#luồng-sử-dụng)
4. [Các màn hình](#các-màn-hình)
5. [Cấu trúc thư mục](#cấu-trúc-thư-mục)
6. [Lớp dữ liệu](#lớp-dữ-liệu)
7. [Phần tính tiền](#phần-tính-tiền)
8. [Kiểm thử](#kiểm-thử)
9. [Triển khai](#triển-khai)
10. [Việc còn lại](#việc-còn-lại)

## Chạy trên máy

Cần Node.js 22 trở lên, và máy chủ ở `../Be` phải đang chạy.

Ở thư mục `../Be` (lần đầu chạy thêm `npm install`):

```bash
npm run dev
```

Ở thư mục này:

```bash
npm install
```

```bash
npm run dev
```

Mở `http://localhost:5173`. Hệ thống bắt đầu trống, không có dữ liệu mẫu: lần đầu sẽ hiện màn hình **Cài đặt lần đầu** để bạn tự đặt tên, mã PIN của chủ sở hữu và tên nhà nghỉ đầu tiên. Sau đó vào Quản lý để thêm loại phòng và giá (mục Cài đặt), phòng (mục Sơ đồ) và nhân viên.

| Lệnh | Việc |
|---|---|
| `npm run dev` | Chạy bản phát triển |
| `npm run dev:lan` | Như `dev`, nhưng mở cho các máy cùng mạng wifi: trên điện thoại vào `http://<địa chỉ IP của máy tính>:5173` để thử bằng điện thoại thật |
| `npm run dev:try` | Chạy **bản thử** ở cổng 5174, nối với máy chủ thử (`npm run dev:try` trong `../Be`). Dùng để bấm thử mà không đụng sổ sách thật |
| `npm test` | Chạy kiểm thử |
| `npm run build` | Kiểm tra kiểu và đóng gói ra `dist/` |
| `npm run preview` | Xem thử bản đã đóng gói |

Địa chỉ máy chủ lấy từ biến `VITE_API_URL` (xem `.env.example`). Bỏ trống thì dùng cổng 3000 trên chính máy đang phục vụ giao diện: `http://localhost:3000/api` khi mở trên máy tính, `http://<địa chỉ IP>:3000/api` khi mở từ điện thoại.

## Công nghệ

| Phần | Chọn |
|---|---|
| Giao diện | React 19 + TypeScript |
| Đóng gói | Vite |
| Kiểu dáng | Tailwind CSS 4 |
| Kiểm thử | Vitest |
| Xuất Excel | write-excel-file, chỉ tải khi bấm xuất |
| Mã QR chuyển khoản | qrcode.react, nội dung theo chuẩn VietQR |

Không dùng thư viện định tuyến hay quản lý trạng thái: ứng dụng chỉ có vài màn hình và một kho trạng thái nhỏ.

## Luồng sử dụng

```text
Cài đặt lần đầu (chỉ một lần cho cả hệ thống: tạo chủ sở hữu, mã PIN, nhà nghỉ đầu tiên)
Chọn cơ sở (một lần cho mỗi máy, máy tự nhớ)
  → Nhập PIN (mỗi ca)
  → Sơ đồ phòng
      → bấm phòng trống: nhận phòng hoặc đặt trước
      → bấm phòng có khách: dịch vụ, phụ thu, giảm giá, thu trước, đổi phòng, trả phòng
  → Kết thúc ca: xác nhận tiền mặt khớp hoặc lệch
```

- Chỉ có một cơ sở đang hoạt động thì bước chọn cơ sở tự bỏ qua.
- Người trực nhập PIN là ca tự mở. Chủ vào xem thì không mở ca; ca của chủ tự mở khi chủ nhận phòng hoặc thu tiền.
- Người khác nhập PIN khi ca trước chưa kết thúc thì phải xác nhận đóng ca cũ trước.
- Nút "Khóa" quay về màn PIN mà không kết thúc ca.

## Các màn hình

| Màn hình | Ai thấy | Nội dung |
|---|---|---|
| Cài đặt lần đầu | Người mở trang đầu tiên | Chỉ hiện khi hệ thống chưa có tài khoản nào. Nhập tên chủ, tên nhà nghỉ, mã PIN hai lần, và mã cài đặt nếu máy chủ có đặt `SETUP_CODE`. Tạo xong là vào thẳng ứng dụng |
| Chọn cơ sở | Mọi người | Danh sách nhà nghỉ đang hoạt động. Chủ đã đăng nhập thêm được cơ sở mới ở đây |
| Nhập PIN | Mọi người | Bàn phím số. Sai thì hiện câu báo của máy chủ: số lần còn lại, đang bị khóa, hoặc chưa được phân công |
| Sơ đồ phòng | Mọi người | Vẽ theo tầng, hàng, cột. Mỗi ô hiện kiểu thuê, giờ vào, thời gian đã ở hoặc hạn trả, tiền còn phải thu, nhãn quá hạn, đặt trước, trễ hẹn |
| Chi tiết phòng | Mọi người | Nhận phòng, đặt trước, hóa đơn tạm tính, mã QR, ảnh giấy tờ, ghi chú, trả phòng |
| Lượt thuê | Mọi người | Danh sách theo trạng thái (đang ở, đặt trước, đã trả, đã hủy), tìm theo tên, điện thoại, số phòng |
| Kết thúc ca | Mọi người | Tiền mặt, chuyển khoản, tổng ca; bấm Khớp hoặc Lệch, kèm ghi chú |
| Báo cáo | Chủ | Ngày, tháng, năm; theo ca; cơ cấu doanh thu; khoản chi; ghi chú; xuất Excel. Xem gộp "Tất cả cơ sở" thì có bảng Theo cơ sở, và từng ca, khoản thu, khoản chi, ghi chú đều ghi tên cơ sở |
| Quản lý | Chủ | Bốn tab: Sơ đồ, Cài đặt, Nhân viên, Cơ sở |

Trong mục Quản lý:

| Tab | Việc | Phạm vi |
|---|---|---|
| Sơ đồ | Thêm, sửa, chuyển chỗ, xóa phòng; thêm tầng. Mỗi tầng tối đa 4 dãy, mỗi dãy 12 phòng; dãy dài hơn màn hình thì kéo ngang | Cơ sở đang mở |
| Cài đặt | Loại phòng và giá, dịch vụ, quyền người trực, mã QR chuyển khoản (không bắt buộc, thu gọn sẵn), quy tắc tính tiền | Cơ sở đang mở |
| Nhân viên | Thêm, sửa, xem và đổi PIN, ngừng, xóa | Mọi cơ sở |
| Cơ sở | Thêm, đổi tên, ngừng, xóa | Mọi cơ sở |

## Cấu trúc thư mục

```text
src/
  App.tsx           Chọn màn hình: chọn cơ sở, nhập PIN, hay trang chính; thanh báo lỗi chung
  types.ts          Mọi kiểu dữ liệu của nghiệp vụ
  api/
    http.ts         Gọi máy chủ: địa chỉ, mã phiên, đọc câu báo lỗi
    store.ts        Trạng thái phía trình duyệt và bản chụp dữ liệu lấy từ máy chủ
    index.ts        Các thao tác nghiệp vụ: nhận phòng, thu tiền, trả phòng, ca, ghi chú, ảnh…
    admin.ts        Các thao tác quản lý mà form tự hiện lỗi: tài khoản, PIN, cơ sở
  lib/              Phần tính toán thuần, không phụ thuộc giao diện (xem bên dưới)
  pages/            Mỗi file một màn hình
  components/       Thành phần dùng chung: hộp thoại, ô nhập tiền, ảnh, ghi chú, sửa khách
  hooks/useNow.ts   Thời điểm hiện tại theo đồng hồ máy chủ, tự cập nhật
```

Các màn hình trong `pages/`:

| File | Màn hình |
|---|---|
| `Setup.tsx` | Cài đặt lần đầu |
| `PropertyPicker.tsx` | Chọn cơ sở |
| `LoginPin.tsx` | Nhập PIN |
| `Home.tsx` | Khung trang chính: thanh trên, điều hướng, lời nhắc về ca |
| `RoomMap.tsx` | Sơ đồ phòng |
| `RoomSheet.tsx` | Chi tiết một phòng |
| `Stays.tsx` | Danh sách lượt thuê |
| `EndShift.tsx` | Kết thúc ca |
| `Report.tsx` | Báo cáo |
| `Manage.tsx` | Khung của mục Quản lý |
| `MapEditor.tsx`, `PricingSettings.tsx`, `StaffSettings.tsx`, `PropertySettings.tsx` | Bốn tab của Quản lý |

## Lớp dữ liệu

Màn hình không gọi máy chủ trực tiếp. Chúng đọc qua `useDb()` và thay đổi qua các hàm trong `src/api`, ví dụ `checkIn()`, `addPayment()`, `checkOut()`, `closeShift()`.

- **Bản chụp.** `useDb()` trả về bản chụp dữ liệu của cơ sở đang mở, lấy từ `GET /api/state`: phòng, loại phòng, dịch vụ, các lượt đang ở và đặt trước, khoản thu liên quan, ca đang mở. Chủ còn thấy danh sách mọi cơ sở và mọi tài khoản.
- **Tự làm mới.** Bản chụp được lấy lại sau mỗi thao tác, mỗi 10 giây khi trang đang được nhìn, và khi quay lại trang. Nhờ vậy thay đổi từ máy khác hiện lên mà không phải tải lại.
- **Lượt đã trả, đã hủy và báo cáo** không nằm trong bản chụp. Màn hình Lượt thuê và Báo cáo gọi riêng `fetchStays()` và `fetchReport()`.
- **Lỗi.** Thao tác thường (`run`) thất bại thì câu báo của máy chủ hiện ở thanh đỏ trên đầu trang. Thao tác trong form quản lý (`attempt`) trả về câu báo để form hiện ngay cạnh ô nhập.
- **Đồng hồ.** Mọi phép tính theo thời gian trên màn hình (thời gian đã ở, tiền tạm tính, quá hạn) dùng giờ của máy chủ, lấy về cùng mỗi bản chụp (`api/clock.ts`), không dùng đồng hồ của máy đang mở. Lúc trả phòng, số tiền đang hiện được gửi kèm; máy chủ tính ra số khác thì từ chối, màn hình ở lại và hiện số mới. Máy đặt sai múi giờ thì có dòng cảnh báo ở đầu trang.
- **Hết phiên.** Máy chủ trả 401 hoặc 403 khi lấy bản chụp (phiên hết hạn, tài khoản bị ngừng, bị gỡ khỏi cơ sở) thì giao diện quay về màn nhập PIN.
- **Mã PIN** không bao giờ nằm trong bản chụp. Chủ bấm "Xem" thì giao diện hỏi riêng máy chủ cho đúng người đó.
- **Ảnh giấy tờ** được thu nhỏ trên trình duyệt rồi tải lên; khi xem thì lấy qua lệnh gọi có mã phiên, không gắn đường dẫn ảnh trực tiếp.

Quy tắc nghiệp vụ (PIN không trùng, luôn còn một chủ, không xóa thứ đã có dữ liệu, quyền của người trực…) do máy chủ kiểm tra. Giao diện chỉ kiểm tra trước vài chỗ để báo lỗi dễ hiểu hơn.

## Phần tính tiền

Mọi phép tính nằm trong `src/lib`, là hàm thuần và có kiểm thử riêng. Máy chủ dùng lại đúng các file này, nên số tạm tính trên giao diện và số chốt ở máy chủ không thể lệch nhau.

| File | Việc | Máy chủ dùng chung |
|---|---|---|
| `pricing.ts` | Tiền phòng theo năm kiểu thuê, phụ thu trả muộn, khung giờ qua đêm | Có |
| `bill.ts` | Hóa đơn: tiền phòng + thêm người + dịch vụ và phụ thu − giảm giá − đã thu | Có |
| `booking.ts` | Phát hiện trùng lịch, trễ hẹn | Có |
| `report.ts` | Số liệu báo cáo ngày, tháng, năm; chia theo cơ sở khi xem gộp | Có |
| `format.ts`, `labels.ts` | Định dạng tiền, ngày giờ; nhãn tiếng Việt | Có |
| `reportSheets.ts` | Nội dung file Excel | Không |
| `vietqr.ts` | Chuỗi mã QR chuyển khoản | Không |
| `image.ts` | Thu nhỏ ảnh trước khi tải lên | Không |

Muốn đổi cách tính tiền: sửa ở đây, chạy `npm test`, rồi sang `../Be` chạy `npm run sync:domain` và `npm test`.

Mọi con số (giá, phần trăm phụ thu, mốc giờ, ân hạn) là cài đặt của từng cơ sở, sửa trong Quản lý → Cài đặt, không viết cứng trong code. Quy tắc nghiệp vụ đầy đủ ghi ở `../Be/README.md`.

## Kiểm thử

```bash
npm test
```

Kiểm thử ở đây phủ phần tính toán. Các quy tắc về tài khoản, phân quyền và luồng nhận trả phòng được kiểm thử ở máy chủ (`../Be/test`), nơi chúng được thực thi. Giao diện chưa có kiểm thử tự động.

| File | Nội dung |
|---|---|
| `lib/pricing.test.ts` | Bảng tình huống tính tiền phòng |
| `lib/bill.test.ts` | Công thức hóa đơn |
| `lib/booking.test.ts` | Trùng lịch, trễ hẹn |
| `lib/report.test.ts` | Số liệu báo cáo và việc tạo file Excel |
| `lib/vietqr.test.ts` | Cấu trúc và mã kiểm tra của chuỗi QR |

## Triển khai

Giao diện là trang tĩnh, đặt trên Cloudflare Pages:

- Lệnh build: `npm run build`, thư mục xuất: `dist`.
- Đặt biến môi trường `VITE_API_URL` thành địa chỉ API, ví dụ `https://ten-api.onrender.com/api`.
- Ở máy chủ, đặt `CORS_ORIGIN` thành địa chỉ của trang này.

## Việc còn lại

- Triển khai thật (xem `../Be/README.md`).
- Quét thử mã QR bằng ứng dụng ngân hàng thật; mã số ngân hàng trong `lib/vietqr.ts` cần đối chiếu lại.
- Thử trên điện thoại thật (`npm run dev:lan`): chụp ảnh giấy tờ bằng camera, và xem lại bố cục, màu sắc. Mới rà bằng khổ màn hình giả lập 375px: không màn nào tràn ngang.
- Khi máy chủ trên Render đang ngủ, lượt mở đầu tiên chờ 30–60 giây ở màn "Đang kết nối máy chủ".
