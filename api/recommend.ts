import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleError, methodNotAllowed } from './_lib/auth.js'
import { parseRecommendQuery, recommendNearby } from './_lib/recommend.js'

/**
 * GET /api/recommend?lat=&lng=&keyword=
 *
 * 블로그 글을 근거로 매기는 순위라 분 단위로 바뀌지 않는다. 같은 동네에서 여러 번 열어도
 * 원본(카카오 로컬 · 다음 블로그)을 다시 때리지 않도록 CDN 캐시를 길게 잡는다.
 * 좌표는 소수점까지 다 들어오지만 캐시 키는 URL 전체라, 같은 자리에서 새로고침할 때만 걸린다.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'GET') return methodNotAllowed(res, ['GET'])

    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=1800')
    return res.status(200).json(await recommendNearby(parseRecommendQuery(req.query)))
  } catch (error) {
    return handleError(res, error)
  }
}
