import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleError, methodNotAllowed, requireWriteAccess } from '../_lib/auth'
import { insertRestaurant, listRestaurants, parseDraft } from '../_lib/db'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === 'GET') {
      return res.status(200).json(await listRestaurants())
    }

    if (req.method === 'POST') {
      if (!requireWriteAccess(req, res)) return
      return res.status(201).json(await insertRestaurant(parseDraft(req.body)))
    }

    return methodNotAllowed(res, ['GET', 'POST'])
  } catch (error) {
    return handleError(res, error)
  }
}
