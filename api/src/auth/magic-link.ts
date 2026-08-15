import crypto from 'crypto'
import { Resend } from 'resend'

const RESEND_API_KEY = process.env.RESEND_API_KEY
const APP_URL = process.env.KINDPOOL_APP_URL ?? 'http://localhost:5173'
const MAGIC_TTL_MS = 10 * 60 * 1000 // 10 minutes

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null

export function generateMagicToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

export function magicLinkExpiry(): Date {
  return new Date(Date.now() + MAGIC_TTL_MS)
}

export async function sendMagicLinkEmail(email: string, token: string): Promise<{ ok: boolean; error?: string }> {
  const url = `${APP_URL}/auth/verify?token=${token}`
  if (!resend) {
    if (process.env.NODE_ENV === 'production') {
      return { ok: false, error: 'RESEND_API_KEY not configured' }
    }
    // No Resend key — dev mode. Log the link so it can be used locally.
    console.log(`[auth][dev] magic link for ${email}: ${url}`)
    return { ok: true }
  }
  try {
    await resend.emails.send({
      from: 'KindlePool <auth@kindlepool.dev>',
      to: email,
      subject: 'Your KindlePool login link',
      html: `<p>Click below to sign in to KindlePool:</p><p><a href="${url}">${url}</a></p><p>This link expires in 10 minutes.</p>`,
    })
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message }
  }
}
