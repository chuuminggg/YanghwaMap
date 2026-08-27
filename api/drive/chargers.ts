import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleError, methodNotAllowed } from '../_lib/auth.js'
import { findNearbyChargers, parseChargerQuery } from '../_lib/chargers.js'

/**
 * GET /api/drive/chargers?lat=&lng=&radius=&limit=&availableOnly=1
 *
 * 충전기 상태가 섞여 있어 주차장만큼 길게 캐시하면 '충전 가능'이 과거 값이 된다.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'GET') return methodNotAllowed(res, ['GET'])

    res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=60')
    return res.status(200).json(await findNearbyChargers(parseChargerQuery(req.query)))
  } catch (error) {
    return handleError(res, error)
  }
}
