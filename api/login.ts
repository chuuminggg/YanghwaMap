import type { VercelRequest, VercelResponse } from '@vercel/node'
import { checkPassword, methodNotAllowed } from './_lib/auth'

/** 비밀번호만 확인해 준다. 토큰을 발급하지 않고, 이후 쓰기 요청은 매번 헤더로 비밀번호를 보낸다. */
export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])

  const body = req.body as { password?: unknown } | undefined
  const password = typeof body?.password === 'string' ? body.password : undefined

  const result = checkPassword(password)
  if (!result.ok) return res.status(result.status).json({ error: result.error })

  res.status(200).json({ ok: true })
}
