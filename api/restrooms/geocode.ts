import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleError, methodNotAllowed, requireWriteAccess } from '../_lib/auth.js'
import { geocodeDistrict, MissingKakaoKeyError } from '../_lib/geocode.js'
import { parseDistrict } from '../_lib/restrooms.js'

/**
 * POST /api/restrooms/geocode?district=마포구[&retry=1]
 *
 * 좌표가 비어 있는 행을 한 배치만 채우고 남은 수를 알려 준다.
 * retry=1 이면 앞서 실패로 표시된 행의 표시를 지우고 다시 시도한다.
 * 서버리스 실행 시간 제한이 있어 한 번에 다 하지 않는다 — 호출부가 remaining이 0이 될 때까지 반복한다.
 * DB를 고치므로 쓰기 권한이 필요하다.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])
    if (!requireWriteAccess(req, res)) return

    const district = parseDistrict(req.query)
    const retry = req.query.retry === '1'
    return res.status(200).json(await geocodeDistrict(district, retry))
  } catch (error) {
    if (error instanceof MissingKakaoKeyError) {
      console.error(error)
      return res.status(503).json({ error: error.message })
    }
    return handleError(res, error)
  }
}
