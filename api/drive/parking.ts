import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleError, methodNotAllowed } from '../_lib/auth.js'
import { findNearbyParking, parseParkingQuery } from '../_lib/parking.js'

/**
 * GET /api/drive/parking?lat=&lng=&radius=&limit=&publicOnly=0
 *
 * 공공데이터라 읽기는 공개다. 원본이 하루 단위로만 바뀌므로 CDN에 넉넉히 맡긴다.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'GET') return methodNotAllowed(res, ['GET'])

    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=3600')
    return res.status(200).json(await findNearbyParking(parseParkingQuery(req.query)))
  } catch (error) {
    return handleError(res, error)
  }
}
