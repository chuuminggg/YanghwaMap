import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleError, methodNotAllowed } from '../_lib/auth.js'
import { findNearbyRestrooms, parseNearbyQuery } from '../_lib/restrooms.js'

/** GET /api/restrooms?lat=&lng=&radius=&limit= — 공공데이터라 맛집 목록과 마찬가지로 읽기는 공개다. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === 'GET') {
      const params = parseNearbyQuery(req.query)
      // 같은 좌표를 반복 조회하므로 CDN에 잠깐 맡긴다. 원본이 하루 단위로만 바뀐다.
      res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=3600')
      return res.status(200).json(await findNearbyRestrooms(params))
    }

    return methodNotAllowed(res, ['GET'])
  } catch (error) {
    return handleError(res, error)
  }
}
