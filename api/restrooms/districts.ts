import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleError, methodNotAllowed } from '../_lib/auth.js'
import { listDistricts } from '../_lib/restrooms.js'

/** GET /api/restrooms/districts — 자치구 목록 + 건수. 칩 UI가 한 번만 부른다. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === 'GET') {
      // 시드를 다시 넣기 전까지 바뀌지 않는 집계다
      res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=86400')
      return res.status(200).json(await listDistricts())
    }
    return methodNotAllowed(res, ['GET'])
  } catch (error) {
    return handleError(res, error)
  }
}
