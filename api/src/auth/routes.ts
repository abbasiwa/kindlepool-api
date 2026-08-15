import express from 'express'
import rateLimit from 'express-rate-limit'
import crypto from 'crypto'
import { UserModel } from '../models/user'
import { signSession } from './jwt'
import { generateMagicToken, magicLinkExpiry, sendMagicLinkEmail } from './magic-link'
import { authMiddleware, type AuthedRequest } from './middleware'
import { asyncHandler } from './async-handler'
import { Keypair } from '@stellar/stellar-sdk'

const router = express.Router()

const magicLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => { res.status(429).json({ error: 'Rate limit exceeded' }) },
})

// POST /api/v1/auth/request-magic-link { email }
router.post('/request-magic-link', magicLimiter, asyncHandler(async (req, res) => {
  const { email } = req.body as { email?: string }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: 'Valid email required' })
    return
  }
  const normalized = email.toLowerCase().trim()
  let user = await UserModel.findOne({ email: normalized })
  if (!user) {
    user = await UserModel.create({ email: normalized })
  }
  const token = generateMagicToken()
  user.magicLinkToken = token
  user.magicLinkExpiresAt = magicLinkExpiry()
  await user.save()
  const result = await sendMagicLinkEmail(normalized, token)
  if (!result.ok) {
    res.status(500).json({ error: result.error ?? 'Failed to send email' })
    return
  }
  res.json({ success: true })
}))

// GET /api/v1/auth/verify?token=...
router.get('/verify', asyncHandler(async (req, res) => {
  const { token } = req.query as { token?: string }
  if (!token) {
    res.status(400).json({ error: 'Missing token' })
    return
  }
  const user = await UserModel.findOne({ magicLinkToken: token })
  if (!user || !user.magicLinkExpiresAt || user.magicLinkExpiresAt.getTime() < Date.now()) {
    res.status(400).json({ error: 'Invalid or expired magic link' })
    return
  }
  user.emailVerified = true
  user.magicLinkToken = null
  user.magicLinkExpiresAt = null
  user.lastLoginAt = new Date()
  await user.save()
  const session = signSession({ sub: String(user._id), email: user.email })
  res.json({ success: true, token: session, user: { id: String(user._id), email: user.email } })
}))

// GET /api/v1/auth/me
router.get('/me', authMiddleware, (req: AuthedRequest, res) => {
  res.json({ user: req.user })
})

// POST /api/v1/auth/request-wallet-challenge — server-issued nonce
router.post('/request-wallet-challenge', authMiddleware, asyncHandler(async (req: AuthedRequest, res) => {
  const user = await UserModel.findById(req.user!.id)
  if (!user) { res.status(404).json({ error: 'User not found' }); return }
  const nonce = crypto.randomBytes(32).toString('hex')
  user.walletChallenge = nonce
  user.walletChallengeExpiresAt = new Date(Date.now() + 5 * 60 * 1000)
  await user.save()
  res.json({ challenge: nonce })
}))

// POST /api/v1/auth/link-wallet { wallet, challenge, signature }
router.post('/link-wallet', authMiddleware, asyncHandler(async (req: AuthedRequest, res) => {
  const { wallet, challenge, signature } = req.body as { wallet?: string; challenge?: string; signature?: string }
  if (!wallet || !challenge || !signature) {
    res.status(400).json({ error: 'wallet, challenge, signature required' })
    return
  }
  const user = await UserModel.findById(req.user!.id)
  if (!user) { res.status(404).json({ error: 'User not found' }); return }

  // Verify the challenge matches the stored server-issued nonce + not expired.
  if (!user.walletChallenge || !user.walletChallengeExpiresAt || user.walletChallenge !== challenge || user.walletChallengeExpiresAt.getTime() < Date.now()) {
    res.status(403).json({ error: 'Challenge invalid or expired — request a new one' })
    return
  }

  // Signature is over the exact challenge string (bound to this user's account).
  const signedMessage = `KindlePool link wallet ${user.walletChallenge}`
  try {
    const sigBuf = Buffer.from(signature, 'hex')
    if (sigBuf.length !== 64) throw new Error('bad sig length')
    const kp = Keypair.fromPublicKey(wallet)
    if (!kp.verify(Buffer.from(signedMessage), sigBuf)) {
      res.status(403).json({ error: 'Signature does not prove ownership of wallet' })
      return
    }
  } catch {
    res.status(400).json({ error: 'Invalid wallet address or signature' })
    return
  }

  // Consume the one-time challenge.
  user.walletChallenge = null
  user.walletChallengeExpiresAt = null
  if (!user.walletAddress) user.walletAddress = wallet
  if (!user.linkedWallets.includes(wallet)) user.linkedWallets.push(wallet)
  await user.save()
  res.json({ success: true, wallet, linkedWallets: user.linkedWallets })
}))

// POST /api/v1/auth/logout
router.post('/logout', (_req, res) => {
  res.json({ success: true })
})

export default router
