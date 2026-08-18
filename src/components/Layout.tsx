import { NavLink, Outlet } from 'react-router'

const tabClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-full px-4 py-1.5 text-sm font-medium transition ${
    isActive ? 'bg-brand-500 text-white' : 'text-stone-500 hover:bg-stone-100'
  }`

export function Layout() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col bg-stone-50">
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-stone-50/90 backdrop-blur">
        <div className="flex items-center justify-between px-4 py-3">
          <NavLink to="/" className="text-lg font-bold tracking-tight">
            YanghwaMap <span className="text-brand-500">맛집</span>
          </NavLink>
          <nav className="flex gap-1">
            <NavLink to="/" end className={tabClass}>
              목록
            </NavLink>
            <NavLink to="/map" className={tabClass}>
              지도
            </NavLink>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}
