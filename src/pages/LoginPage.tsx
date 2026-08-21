import { type FormEvent, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { useAuthStore } from '../store/useAuthStore'

export function LoginPage() {
  const authed = useAuthStore((s) => s.authed)
  const login = useAuthStore((s) => s.login)
  const navigate = useNavigate()
  const location = useLocation()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // 로그인한 뒤 /login 으로 직접 들어오면 원래 화면으로 돌려보낸다
  const from = (location.state as { from?: string } | null)?.from ?? '/'
  if (authed) return <Navigate to={from} replace />

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')

    try {
      // 검증은 서버가 한다. 비밀번호 오류·서버 설정 누락 모두 메시지로 돌아온다.
      await login(password)
      navigate(from, { replace: true })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '로그인에 실패했습니다.')
      setPassword('')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center bg-stone-50 px-6">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold tracking-tight">
          YanghwaMap <span className="text-brand-500">맛집</span>
        </h1>
        <p className="mt-2 text-sm text-stone-500">비밀번호를 입력하면 목록을 볼 수 있습니다.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value)
            setError('')
          }}
          autoFocus
          autoComplete="current-password"
          placeholder="비밀번호"
          className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-base outline-none focus:border-brand-500"
        />

        {error && <p className="text-sm text-brand-600">{error}</p>}

        <button
          type="submit"
          disabled={password.length === 0 || submitting}
          className="w-full rounded-xl bg-brand-500 px-4 py-3 font-medium text-white hover:bg-brand-600 disabled:bg-stone-300"
        >
          {submitting ? '확인 중…' : '입장하기'}
        </button>
      </form>
    </div>
  )
}
