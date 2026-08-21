import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuthStore } from '../store/useAuthStore'

/** 로그인하지 않았으면 /login 으로 보내고, 원래 가려던 경로를 기억해 둔다 */
export function RequireAuth() {
  const authed = useAuthStore((s) => s.authed)
  const location = useLocation()

  if (!authed) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }

  return <Outlet />
}
