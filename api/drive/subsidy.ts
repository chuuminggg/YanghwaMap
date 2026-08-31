import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleError, methodNotAllowed } from '../_lib/auth.js'
import {
  fetchSubsidyModels,
  fetchSubsidyStatus,
  parseModelQuery,
  parseSubsidyQuery,
} from '../_lib/subsidy.js'
import { first } from '../_lib/upstream.js'

/**
 * GET /api/drive/subsidy — 전기차 구매보조금 지급현황. 인증이 필요 없는 공개 자료다.
 *
 *   ?vehicle=passenger&year=2026            지자체 전체 현황 (161건 남짓이라 통째로 내린다)
 *   ?kind=models&localCode=1100&vehicle=..  그 지자체의 모델별 보조금
 *
 * 원본이 하루 단위로 갱신되고 응답을 만드는 데 200KB짜리 보호 해제가 끼어 있어
 * CDN 캐시가 특히 크게 아낀다.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'GET') return methodNotAllowed(res, ['GET'])

    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=1800')

    if (first(req.query.kind) === 'models') {
      return res.status(200).json(await fetchSubsidyModels(parseModelQuery(req.query)))
    }
    return res.status(200).json(await fetchSubsidyStatus(parseSubsidyQuery(req.query)))
  } catch (error) {
    return handleError(res, error)
  }
}
