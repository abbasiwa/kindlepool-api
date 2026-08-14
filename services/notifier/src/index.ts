import express from 'express'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import { verifyOwnership } from './auth'
import {
  countSubscriptions,
  deleteSubscription,
  getSubscription,
  upsertSubscription,
} from './store'

const app = express()
const PORT = parseInt(process.env.KINDPOOL_NOTIFIER_PORT ?? '3003', 10)

const NOTIFIER_API_KEY = process.env.KINDPOOL_NOTIFIER_API_KEY

app.use(cors())
app.use(express.json())
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.KINDPOOL_NOTIFIER_RATE_LIMIT ?? '30', 10),
  standardHeaders: true,
  legacyHeaders: false,
}))

// Internal-only guard for /notify (F-901): called by the indexer, not public.
function requireApiKey(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!NOTIFIER_API_KEY) {
    res.status(500).json({ error: 'KINDPOOL_NOTIFIER_API_KEY not configured' })
    return
  }
  const provided = req.headers['x-api-key']
  if (provided !== NOTIFIER_API_KEY) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  next()
}

/**
 * Subscribe an email to a wallet address for notifications.
 * F-901: requires a signature proving ownership of `address` over
 * `challenge` (a nonce string the client chooses).
 */
app.post('/api/v1/subscribe', async (req, res) => {
  const { email, address, challenge, signature, events } = req.body as {
    email?: string
    address?: string
    challenge?: string
    signature?: string
    events?: string[]
  }
  if (!email || !address || !challenge || !signature) {
    res.status(400).json({ error: 'Missing email, address, challenge, or signature' })
    return
  }
  if (!verifyOwnership(address, challenge, signature)) {
    res.status(403).json({ error: 'Signature does not prove ownership of address' })
    return
  }
  await upsertSubscription({
    address,
    email,
    events: events ?? ['deposit', 'goal_reached', 'work_submitted', 'vote_cast', 'pool_paid', 'pool_refunded'],
  })
  console.log(`[subscribe] ${email} -> ${address}`)
  res.json({ success: true })
})

app.post('/api/v1/unsubscribe', async (req, res) => {
  const { address } = req.body as { address?: string }
  if (!address) {
    res.status(400).json({ error: 'Missing address' })
    return
  }
  await deleteSubscription(address)
  res.json({ success: true })
})

app.post('/api/v1/notify', requireApiKey, async (req, res) => {
  const { address, eventType, poolTitle } = req.body as {
    address: string
    eventType: string
    poolTitle: string
    amount?: string
  }

  const sub = await getSubscription(address)
  if (!sub) {
    res.json({ success: false, reason: 'not subscribed' })
    return
  }

  if (!sub.events.includes(eventType)) {
    res.json({ success: false, reason: 'event type not subscribed' })
    return
  }

  const subject = emailSubjects[eventType] ?? 'KindlePool Update'
  const body = emailBodies[eventType] ?? `Update on "${poolTitle}"`
  const finalBody = body.replace('{{pool}}', poolTitle)

  console.log(`[email] To: ${sub.email}`)
  console.log(`[email] Subject: ${subject}`)
  console.log(`[email] Body: ${finalBody}`)
  console.log('---')

  res.json({ success: true, email: sub.email, subject, body: finalBody })
})

const emailSubjects: Record<string, string> = {
  deposit: 'Deposit Confirmed — KindlePool',
  goal_reached: '🎉 Goal Reached! — KindlePool',
  work_submitted: 'Work Submitted for Review — KindlePool',
  vote_cast: 'Vote Cast — KindlePool',
  pool_paid: '✅ Funds Released! — KindlePool',
  pool_refunded: '🔄 Pool Refunded — KindlePool',
  pool_expired: '⏰ Pool Expired — KindlePool',
}

const emailBodies: Record<string, string> = {
  deposit: 'Your deposit has been confirmed for "{{pool}}". Thank you for your support!',
  goal_reached: 'The pool "{{pool}}" has reached its funding goal! Work will be submitted for review soon.',
  work_submitted: 'Work has been submitted for "{{pool}}". Please cast your vote before the deadline.',
  vote_cast: 'Your vote on "{{pool}}" has been recorded.',
  pool_paid: 'The creator of "{{pool}}" has been paid. Thank you for being part of this success!',
  pool_refunded: 'The pool "{{pool}}" has been refunded to all supporters.',
  pool_expired: 'The pool "{{pool}}" has expired without reaching its goal. Funds have been refunded.',
}

app.get('/api/v1/health', async (_req, res) => {
  res.json({ status: 'ok', subscribers: await countSubscriptions() })
})

export function startNotifier(): express.Express {
  app.listen(PORT, () => {
    console.log(`KindlePool Notifier running on port ${PORT}`)
    if (!NOTIFIER_API_KEY) console.warn('WARNING: KINDPOOL_NOTIFIER_API_KEY not set — /notify disabled')
  })
  return app
}

if (require.main === module) {
  startNotifier()
}
