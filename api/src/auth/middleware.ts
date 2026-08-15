import type { Request, Response, NextFunction } from 'express'
import { verifySession } from './jwt'
import { UserModel } from '../models/user'

export interface AuthedUser {
  id: string
  email: string
  displayName?: string
  bio?: string
  walletAddress?: string | null
  linkedWallets?: string[]
  preferences?: Record<string, unknown>
}

export interface AuthedRequest extends Request {
  user?: AuthedUser
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
    | {
        _id: unknown
        email: string
        displayName?: string
        bio?: string
        walletAddress?: string | null
        linkedWallets?: string[]
        preferences?: Record<string, unknown>
      }
    | null
  if (!user) {
    res.status(401).json({ error: 'User not found' })
    return
  }
  ;(req as AuthedRequest).user = {
    id: String(user._id),
    email: user.email,
    displayName: user.displayName ?? '',
    bio: user.bio ?? '',
    walletAddress: user.walletAddress ?? null,
    linkedWallets: user.linkedWallets ?? [],
    preferences: user.preferences ?? {},
  }
  next()
}
