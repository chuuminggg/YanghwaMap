import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleError, methodNotAllowed } from '../_lib/auth.js'
import { findCheapGas, parseGasQuery } from '../_lib/gas.js'

/**
 * GET /api/drive/gas?lat=&lng=&radius=&limit=&product=B027
 *
 * 유가는 하루에 한 번꼴로 바뀌지만 사용자가 유종을 바꿔 가며 볼 화면이라
 * 캐시를 너무 길게 잡으면 오히려 '방금 본 값'과 어긋난다.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'GET') return methodNotAllowed(res, ['GET'])

    res.setHeader('Cache-Control', 'public, max-age=120, s-maxage=600')
    return res.status(200).json(await findCheapGas(parseGasQuery(req.query)))
  } catch (error) {
    return handleError(res, error)
  }
}
