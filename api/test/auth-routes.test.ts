import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import request from 'supertest'
import { app } from '../../services/indexer/src/api'
import { authRouter } from '../src/auth'

let mongo: MongoMemoryServer

// Mount auth router exactly as the unified backend does (before the API-key gate).
app.use('/api/v1/auth', authRouter)

beforeAll(async () => {
  mongo = await MongoMemoryServer.create()
  await mongoose.connect(mongo.getUri())
  process.env.KINDPOOL_APP_URL = 'http://localhost:5173'
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongo.stop()
})

describe('auth routes (mounted on indexer app)', () => {
  it('request-magic-link returns success and creates a user', async () => {
    const res = await request(app).post('/api/v1/auth/request-magic-link').send({ email: 'route@test.com' })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    // dev mode logs the link to stdout — user should now exist
    const user = await mongoose.connection.collection('users').findOne({ email: 'route@test.com' })
    expect(user).toBeTruthy()
    expect(user?.magicLinkToken).toBeTruthy()
  })

  it('rejects invalid email', async () => {
    const res = await request(app).post('/api/v1/auth/request-magic-link').send({ email: 'not-an-email' })
    expect(res.status).toBe(400)
  })

  it('GET /auth/me without a token returns 401', async () => {
    const res = await request(app).get('/api/v1/auth/me')
    expect(res.status).toBe(401)
  })

  it('GET /auth/me with a valid session returns the user', async () => {
    const user = await mongoose.connection.collection('users').findOne({ email: 'route@test.com' })
    const id = String(user?._id)
    const { signSession } = await import('../src/auth/jwt')
    const token = signSession({ sub: id, email: 'route@test.com' })
    const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.user.email).toBe('route@test.com')
  })
})
