import crypto from 'crypto'
import nodemailer from 'nodemailer'

const SMTP_HOST = process.env.BREVO_SMTP_HOST ?? 'smtp-relay.brevo.com'
const SMTP_PORT = parseInt(process.env.BREVO_SMTP_PORT ?? '587', 10)
const SMTP_USER = process.env.BREVO_SMTP_USER
const SMTP_KEY = process.env.BREVO_SMTP_KEY
const APP_URL = process.env.KINDPOOL_APP_URL ?? 'http://localhost:5173'
const MAGIC_TTL_MS = 10 * 60 * 1000 // 10 minutes

let transporter: nodemailer.Transporter | null = null

function getTransporter(): nodemailer.Transporter | null {
  if (transporter) return transporter
  if (!SMTP_USER || !SMTP_KEY) return null
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: false, // STARTTLS on 587
    auth: { user: SMTP_USER, pass: SMTP_KEY },
  })
  return transporter
}

export function generateMagicToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

export function magicLinkExpiry(): Date {
  return new Date(Date.now() + MAGIC_TTL_MS)
}

export async function sendMagicLinkEmail(email: string, token: string): Promise<{ ok: boolean; error?: string }> {
  const url = `${APP_URL}/auth/verify?token=${token}`
  const mail = getTransporter()
  if (!mail) {
    if (process.env.NODE_ENV === 'production') {
      return { ok: false, error: 'BREVO_SMTP_USER / BREVO_SMTP_KEY not configured' }
    }
    // No SMTP creds — dev mode. Log the link so it can be used locally.
    console.log(`[auth][dev] magic link for ${email}: ${url}`)
    return { ok: true }
  }
  try {
    await mail.sendMail({
      from: SMTP_USER,
      to: email,
      subject: 'Your KindlePool login link',
      text: `Click below to sign in to KindlePool:\n\n${url}\n\nThis link expires in 10 minutes.`,
      html: `<p>Click below to sign in to KindlePool:</p><p><a href="${url}">${url}</a></p><p>This link expires in 10 minutes.</p>`,
    })
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message }
  }
}
