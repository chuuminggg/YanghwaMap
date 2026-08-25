import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleError, methodNotAllowed } from '../_lib/auth.js'
import { InvalidInputError } from '../_lib/db.js'
import { fetchCctv, fetchTraffic, parseCctvQuery, parseTrafficQuery } from '../_lib/highway.js'
import { first } from '../_lib/upstream.js'

/**
 * GET /api/drive/highway — 고속도로 실시간 소통과 CCTV. 공공데이터라 읽기는 공개다.
 *
 *   ?kind=traffic&route=경부선&keyword=서울&limit=30
 *   ?kind=cctv&lat=&lng=&radius=&limit=&roadType=ex|its|all
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'GET') return methodNotAllowed(res, ['GET'])

    const kind = first(req.query.kind) ?? 'traffic'

    if (kind === 'traffic') {
      // 원본이 5분 단위로 갱신되므로 그보다 짧게 잡아 둔다.
      // 전국 8천 행을 매번 받아 거르는 요청이라 CDN이 대신 받아 주는 게 특히 크다.
      res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=60')
      return res.status(200).json(await fetchTraffic(parseTrafficQuery(req.query)))
    }

    if (kind === 'cctv') {
      // 카메라 위치는 거의 바뀌지 않지만 스트림 주소에 만료가 있어 길게 잡지 않는다
      res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300')
      return res.status(200).json(await fetchCctv(parseCctvQuery(req.query)))
    }

    throw new InvalidInputError("'kind'는 traffic 또는 cctv 여야 합니다.")
  } catch (error) {
    return handleError(res, error)
  }
}
