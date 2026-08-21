import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleError, methodNotAllowed } from '../_lib/auth.js'
import {
  findNearbyRestrooms,
  listRestroomsByDistrict,
  parseDistrict,
  parseNearbyQuery,
} from '../_lib/restrooms.js'

/**
 * GET /api/restrooms — 공공데이터라 맛집 목록과 마찬가지로 읽기는 공개다.
 *
 *   ?district=마포구             자치구 전체 목록 (좌표 없는 항목 포함, 이름순)
 *   ?lat=&lng=&radius=&limit=   현재 위치 기준 거리순 (좌표 있는 항목만)
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === 'GET') {
      // 원본이 하루 단위로만 바뀌므로 CDN에 잠깐 맡긴다
      res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=3600')

      if (req.query.district !== undefined) {
        return res.status(200).json(await listRestroomsByDistrict(parseDistrict(req.query)))
      }

      return res.status(200).json(await findNearbyRestrooms(parseNearbyQuery(req.query)))
    }

    return methodNotAllowed(res, ['GET'])
  } catch (error) {
    return handleError(res, error)
  }
}
