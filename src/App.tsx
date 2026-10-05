import { useEffect, useState } from 'react'
import { chooseProperty, loadPropertyNames, loadSetup, logout, refresh, setError, useApp } from './api'
import { btnPrimary } from './components/ui'
import Home from './pages/Home'
import LoginPin from './pages/LoginPin'
import PropertyPicker from './pages/PropertyPicker'
import Setup from './pages/Setup'

// Thứ tự: chọn cơ sở (một lần cho mỗi máy) rồi mới nhập PIN (mỗi ca).
export default function App() {
  const { setup, session, propertyId, propertyNames, db, loaded, error, zoneMismatch } = useApp()
  const [picking, setPicking] = useState(false)

  useEffect(() => {
    void loadSetup()
    void loadPropertyNames()
    // Tải lại trang khi đang đăng nhập: lấy lại dữ liệu của cơ sở đã chọn.
    void refresh()
  }, [])

  // Chủ đã đăng nhập thì dùng danh sách vừa tải về (thấy ngay cơ sở mới thêm); còn lại dùng
  // danh sách tên công khai.
  const names =
    session?.role === 'owner' && loaded ? db.properties.filter((property) => property.active) : propertyNames
  const chosen = names?.find((property) => property.id === propertyId) ?? null
  // Chỉ có một cơ sở đang hoạt động thì không cần hỏi.
  const only = names?.length === 1 ? names[0] : null

  useEffect(() => {
    if (!chosen && only) chooseProperty(only.id)
  }, [chosen, only])

  let screen
  if (names === null || setup === null) {
    // Chưa hỏi được máy chủ: máy chủ đang khởi động hoặc mất mạng.
    screen = (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-slate-50 px-4 text-center">
        <p className="text-sm text-slate-600">Đang kết nối máy chủ…</p>
        <button
          type="button"
          className={`${btnPrimary} px-6 py-3`}
          onClick={() => {
            void loadSetup()
            void loadPropertyNames()
          }}
        >
          Thử lại
        </button>
      </main>
    )
  } else if (setup.needsSetup) {
    // Hệ thống chưa có tài khoản nào: chủ sở hữu tự tạo tài khoản và mã PIN của mình.
    screen = <Setup codeRequired={setup.codeRequired} />
  } else if (!chosen || picking) {
    screen = (
      <PropertyPicker
        names={names}
        canAdd={session?.role === 'owner'}
        currentId={chosen?.id}
        onBack={chosen ? () => setPicking(false) : undefined}
        onPick={(nextId) => {
          chooseProperty(nextId)
          setPicking(false)
          // Danh sách tên công khai có thể chưa có cơ sở vừa thêm.
          void loadPropertyNames()
        }}
      />
    )
  } else if (!session) {
    screen = (
      <LoginPin
        propertyId={chosen.id}
        propertyName={chosen.name}
        onChangeProperty={names.length > 1 ? () => setPicking(true) : undefined}
      />
    )
  } else {
    const property = db.properties.find((item) => item.id === chosen.id)
    screen =
      loaded && property ? (
        <Home
          key={property.id}
          session={session}
          property={property}
          onSwitchProperty={() => setPicking(true)}
          onLogout={() => {
            setPicking(false)
            logout()
          }}
        />
      ) : (
        <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-slate-50 px-4">
          <p className="text-sm text-slate-600">Đang tải dữ liệu…</p>
          <button type="button" className={`${btnPrimary} px-6 py-3`} onClick={() => void refresh()}>
            Thử lại
          </button>
        </main>
      )
  }

  return (
    <>
      {error && (
        <div
          role="alert"
          className="fixed inset-x-0 top-0 z-20 flex items-start justify-between gap-3 bg-red-600 px-4 py-3 text-sm text-white"
        >
          <span>{error}</span>
          <button type="button" className="shrink-0 underline" onClick={() => setError('')}>
            Đóng
          </button>
        </div>
      )}
      {zoneMismatch && session && (
        <p role="alert" className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-900">
          Máy này đang đặt múi giờ khác giờ Việt Nam, nên giờ và tiền tạm tính trên màn hình có thể sai. Chỉnh múi giờ
          của máy về Việt Nam (UTC+7) rồi tải lại trang.
        </p>
      )}
      {screen}
    </>
  )
}
