import jwt from 'jsonwebtoken'

const DEFAULT_SECRET = 'kindlepool-dev-secret-change-me'
const JWT_SECRET = process.env.JWT_SECRET ?? DEFAULT_SECRET
const TOKEN_TTL = process.env.JWT_TTL ?? '7d'

if (JWT_SECRET === DEFAULT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET must be set in production')
}

export interface SessionPayload {
  sub: string // user id
  email: string
}

export function signSession(payload: SessionPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_TTL as jwt.SignOptions['expiresIn'] })
}

export function verifySession(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as SessionPayload
  } catch {
    return null
  }
}
