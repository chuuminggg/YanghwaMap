import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { setApiPassword, setUnauthorizedHandler, verifyPassword } from '../lib/api'

type AuthState = {
  /** 서버 검증을 통과한 공유 비밀번호. 이후 쓰기 요청 헤더에 그대로 실린다. */
  password: string | null
  authed: boolean
  /** 서버에 비밀번호를 확인시키고 통과하면 저장한다. 실패하면 ApiError를 던진다. */
  login: (password: string) => Promise<void>
  logout: () => void
}

/**
 * 여러 사람이 같은 비밀번호를 나눠 쓰는 간단한 잠금장치다.
 * 세션 토큰을 발급하지 않고 비밀번호 자체를 localStorage에 두므로,
 * "링크를 아는 사람을 걸러내는" 수준의 보호로만 기대해야 한다.
 * 다만 검증 주체는 서버(APP_PASSWORD)이므로 빌드 결과물에 비밀번호가 노출되지는 않는다.
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      password: null,
      authed: false,

      login: async (candidate) => {
        await verifyPassword(candidate)
        setApiPassword(candidate)
        set({ password: candidate, authed: true })
      },

      logout: () => {
        setApiPassword(null)
        set({ password: null, authed: false })
      },
    }),
    {
      name: 'yanghwa-map-auth',
      version: 2,
      partialize: (state) => ({ password: state.password }),
      // 새로고침 직후에도 api 모듈이 비밀번호를 갖고 있어야 쓰기 요청이 통과한다
      merge: (persisted, current) => {
        const password = (persisted as { password?: string | null } | undefined)?.password ?? null
        setApiPassword(password)
        return { ...current, password, authed: Boolean(password) }
      },
    },
  ),
)

// 서버가 401을 돌려주면(비밀번호 변경 등) 저장된 값을 버리고 로그인 화면으로 돌아가게 한다
setUnauthorizedHandler(() => useAuthStore.getState().logout())
