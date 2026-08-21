import { createHash, timingSafeEqual } from 'node:crypto'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { InvalidInputError, MissingDatabaseUrlError } from './db.js'

/** 쓰기 요청이 공유 비밀번호를 실어 보내는 헤더 이름 */
export const PASSWORD_HEADER = 'x-app-password'

type CheckResult = { ok: true } | { ok: false; status: number; error: string }

/** 길이까지 감추기 위해 원문 대신 고정 길이 해시를 비교한다. */
const digest = (value: string) => createHash('sha256').update(value).digest()

export function checkPassword(candidate: string | undefined): CheckResult {
  const expected = process.env.APP_PASSWORD
  if (!expected) {
    return {
      ok: false,
      status: 503,
      error: '서버에 APP_PASSWORD가 설정되지 않았습니다. 배포 환경 변수를 확인해 주세요.',
    }
  }
  if (!candidate || !timingSafeEqual(digest(candidate), digest(expected))) {
    return { ok: false, status: 401, error: '비밀번호가 올바르지 않습니다.' }
  }
  return { ok: true }
}

/**
 * 쓰기(POST/PATCH/DELETE) 전 호출한다. 실패하면 응답까지 마치고 false를 돌려주므로
 * 호출부는 `if (!requireWriteAccess(req, res)) return` 형태로 쓰면 된다.
 * 읽기(GET)는 공개다 — 프런트 비밀번호와 마찬가지로 "링크를 아는 사람" 수준의 잠금장치다.
 */
export function requireWriteAccess(req: VercelRequest, res: VercelResponse): boolean {
  const header = req.headers[PASSWORD_HEADER]
  const result = checkPassword(Array.isArray(header) ? header[0] : header)
  if (result.ok) return true
  res.status(result.status).json({ error: result.error })
  return false
}

export function methodNotAllowed(res: VercelResponse, allowed: string[]) {
  res.setHeader('Allow', allowed.join(', '))
  res.status(405).json({ error: `지원하지 않는 메서드입니다. (${allowed.join(', ')})` })
}

/** 예상 가능한 오류는 그대로, 그 외에는 내부 사정을 감춘 채 500으로 돌려준다. */
export function handleError(res: VercelResponse, error: unknown) {
  if (error instanceof InvalidInputError) {
    res.status(400).json({ error: error.message })
    return
  }
  if (error instanceof MissingDatabaseUrlError) {
    console.error(error)
    res.status(503).json({ error: error.message })
    return
  }
  console.error(error)
  res.status(500).json({ error: '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' })
}
