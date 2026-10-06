import { useEffect } from 'react'
import { NavLink, Outlet } from 'react-router'
import { useAuthStore } from '../store/useAuthStore'
import { useRestaurantStore } from '../store/useRestaurantStore'

/**
 * 탭은 화면 아래에 둔다.
 *
 * 헤더에 늘어놓던 시절에는 탭이 늘 때마다 390px 화면에서 넘쳤다. 가로 스크롤로 피해 봤지만
 * 뒤쪽 탭이 화면 밖에 숨어 버려 있는 줄도 모르게 된다. 아래로 내리면 한 줄에 다 들어오고
 * 엄지로 누르기도 쉽다.
 *
 * 화면 높이는 여기서 flex 로 나눈다. 하위 화면들이 '화면 꽉 찬 지도 + 목록'을 그리려고
 * 헤더 높이를 직접 빼서 계산하던 걸(h-[calc(100dvh-57px)]) 없애려는 것이다 — 이제 h-full 이면 된다.
 */
const TABS = [
  { to: '/', label: '목록', end: true, icon: 'M4 6h16M4 12h16M4 18h10' },
  { to: '/map', label: '지도', icon: 'M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z M12 11.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z' },
  { to: '/recommend', label: '추천', icon: 'M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8-4.2-4.1 5.9-.9L12 3.5Z' },
  { to: '/restroom', label: '화장실', icon: 'M7 3.5a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2Z M4.8 20.5V14H3.6l1.6-5.3h3.6L10.4 14H9.2v6.5H4.8Z M17 3.5a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2Z M14 14.5l1.6-6h2.8l1.6 6h-2l.4 6h-2.8l.4-6h-2Z' },
  { to: '/drive', label: '운전', icon: 'M5 16.5h14M6.5 16.5v2H5v-2M19 16.5v2h-1.5v-2M4.5 16.5l1.4-5.2A2 2 0 0 1 7.8 9.8h8.4a2 2 0 0 1 1.9 1.5l1.4 5.2M8 13h8' },
]

const tabClass = ({ isActive }: { isActive: boolean }) =>
  `flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition ${
    isActive ? 'text-brand-600' : 'text-stone-400 hover:text-stone-600'
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
    <div className="mx-auto flex h-dvh w-full max-w-2xl flex-col bg-stone-50">
      <header className="shrink-0 border-b border-stone-200 bg-stone-50/90 backdrop-blur">
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          {/* 탭이 아래로 내려가 자리가 넉넉해졌으므로 워드마크를 모바일에서도 보여 준다 */}
          <NavLink to="/" className="min-w-0 truncate text-lg font-bold tracking-tight">
            YanghwaMap <span className="text-brand-500">맛집</span>
          </NavLink>
          <button
            type="button"
            onClick={logout}
            className="shrink-0 rounded-full px-3 py-1.5 text-sm text-stone-400 hover:bg-stone-100"
          >
            잠금
          </button>
        </div>
      </header>

      {/* min-h-0 이 없으면 긴 목록이 flex 를 밀어내 하단 탭바가 화면 밖으로 내려간다 */}
      <main className="min-h-0 flex-1 overflow-y-auto">
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

      {/* pb-[env(safe-area-inset-bottom)] — 아이폰 홈 바에 탭이 가리지 않게 한다 */}
      <nav className="shrink-0 border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-stretch">
          {TABS.map((tab) => (
            <NavLink key={tab.to} to={tab.to} end={tab.end} className={tabClass}>
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d={tab.icon} />
              </svg>
              {tab.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
