import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { UserModel } from '../src/models/user'
import { signSession, verifySession } from '../src/auth/jwt'
import { generateMagicToken, magicLinkExpiry } from '../src/auth/magic-link'

let mongo: MongoMemoryServer

beforeAll(async () => {
  mongo = await MongoMemoryServer.create()
  await mongoose.connect(mongo.getUri())
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongo.stop()
})

describe('User model (auth)', () => {
  it('creates a user with magic-link fields', async () => {
    const u = await UserModel.create({
      email: 'test@example.com',
      magicLinkToken: 'abc',
      magicLinkExpiresAt: new Date(),
    })
    expect(u.email).toBe('test@example.com')
    expect(u.magicLinkToken).toBe('abc')
    expect(u.emailVerified).toBe(false)
    await u.deleteOne()
  })

  it('generates a strong magic token and expiry', () => {
    const token = generateMagicToken()
    expect(token).toHaveLength(64)
    expect(magicLinkExpiry().getTime()).toBeGreaterThan(Date.now())
  })
})

describe('JWT sessions', () => {
  it('signs and verifies a session', async () => {
    const token = signSession({ sub: 'user1', email: 'a@b.com' })
    const payload = verifySession(token)
    expect(payload?.sub).toBe('user1')
    expect(payload?.email).toBe('a@b.com')
  })

  it('returns null for a tampered token', () => {
    expect(verifySession('not-a-jwt')).toBeNull()
  })
})
