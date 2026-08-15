import type { Request, Response, NextFunction } from 'express'
import { verifySession } from './jwt'
import { UserModel } from '../models/user'

export interface AuthedRequest extends Request {
  user?: { id: string; email: string }
}

export async function authMiddleware(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined
  if (!token) {
    res.status(401).json({ error: 'Missing Bearer token' })
    return
  }
  const payload = verifySession(token)
  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired session' })
    return
  }
  const user = await UserModel.findById(payload.sub).lean().catch(() => null) as unknown as
    | { _id: unknown; email: string }
    | null
  if (!user) {
    res.status(401).json({ error: 'User not found' })
    return
  }
  ;(req as AuthedRequest).user = { id: String(user._id), email: user.email }
  next()
}
