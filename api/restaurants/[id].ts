import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleError, methodNotAllowed, requireWriteAccess } from '../_lib/auth'
import { deleteRestaurant, parsePatch, patchRestaurant } from '../_lib/db'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const raw = req.query.id
  const id = Array.isArray(raw) ? raw[0] : raw

  // uuid가 아니면 DB에 물어볼 것도 없다 (옛 seed-01 형태의 북마크가 500이 되지 않도록)
  if (!id || !UUID.test(id)) {
    return res.status(404).json({ error: '존재하지 않는 맛집입니다.' })
  }

  try {
    if (req.method === 'PATCH') {
      if (!requireWriteAccess(req, res)) return
      const updated = await patchRestaurant(id, parsePatch(req.body))
      if (!updated) return res.status(404).json({ error: '존재하지 않는 맛집입니다.' })
      return res.status(200).json(updated)
    }

    if (req.method === 'DELETE') {
      if (!requireWriteAccess(req, res)) return
      const deleted = await deleteRestaurant(id)
      if (!deleted) return res.status(404).json({ error: '존재하지 않는 맛집입니다.' })
      return res.status(204).end()
    }

    return methodNotAllowed(res, ['PATCH', 'DELETE'])
  } catch (error) {
    return handleError(res, error)
  }
}
