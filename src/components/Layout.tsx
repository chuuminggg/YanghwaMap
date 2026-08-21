import { useEffect } from 'react'
import { NavLink, Outlet } from 'react-router'
import { useAuthStore } from '../store/useAuthStore'
import { useRestaurantStore } from '../store/useRestaurantStore'

const tabClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-full px-4 py-1.5 text-sm font-medium transition ${
    isActive ? 'bg-brand-500 text-white' : 'text-stone-500 hover:bg-stone-100'
  }`

export function Layout() {
  const logout = useAuthStore((s) => s.logout)
  const status = useRestaurantStore((s) => s.status)
  const error = useRestaurantStore((s) => s.error)
  const load = useRestaurantStore((s) => s.load)

  // 하위 화면 전부가 같은 목록을 쓰므로 여기서 한 번만 서버에서 받아 온다
  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col bg-stone-50">
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-stone-50/90 backdrop-blur">
        <div className="flex items-center justify-between px-4 py-3">
          <NavLink to="/" className="text-lg font-bold tracking-tight">
            YanghwaMap <span className="text-brand-500">맛집</span>
          </NavLink>
          <nav className="flex items-center gap-1">
            <NavLink to="/" end className={tabClass}>
              목록
            </NavLink>
            <NavLink to="/map" className={tabClass}>
              지도
            </NavLink>
            <button
              type="button"
              onClick={logout}
              className="ml-1 rounded-full px-3 py-1.5 text-sm text-stone-400 hover:bg-stone-100"
            >
              잠금
            </button>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* 데이터가 도착하기 전에는 화면을 열지 않는다 — 상세 화면이 '없는 맛집'을 잠깐 띄우는 걸 막는다 */}
        {status === 'ready' ? (
          <Outlet />
        ) : status === 'error' ? (
          <div className="space-y-3 p-8 text-center">
            <p className="text-sm text-stone-700">목록을 불러오지 못했습니다.</p>
            <p className="text-xs text-stone-400">{error}</p>
            <button
              type="button"
              onClick={() => void load(true)}
              className="rounded-lg border border-stone-300 px-4 py-2 text-sm text-stone-700 hover:bg-white"
            >
              다시 시도
            </button>
          </div>
        ) : (
          <p className="p-8 text-center text-sm text-stone-400">불러오는 중…</p>
        )}
      </main>
    </div>
  )
}
