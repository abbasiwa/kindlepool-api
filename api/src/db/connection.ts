import mongoose from 'mongoose'

export const MONGO_URL = process.env.KINDPOOL_MONGO_URL ?? ''

export async function connectMongo(): Promise<void> {
  if (!MONGO_URL) {
    console.warn('⚠️  KINDPOOL_MONGO_URL not set — MongoDB persistence disabled')
    return
  }
  await mongoose.connect(MONGO_URL, { serverSelectionTimeoutMS: 5000 })
  console.log('✅ MongoDB connected')
}

export function mongoEnabled(): boolean {
  return MONGO_URL !== ''
}
