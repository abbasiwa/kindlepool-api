import { Schema, model, models, type InferSchemaType } from 'mongoose'

const apiKeySchema = new Schema(
  {
    keyHash: { type: String, required: true, unique: true, index: true },
    keyPrefix: { type: String, required: true },
    name: { type: String, required: true },
    tier: { type: String, enum: ['free', 'pro'], required: true, default: 'free' },
    rateLimit: { type: Number, required: true, default: 100 },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true },
)

apiKeySchema.index({ name: 1 }, { unique: true })

export type ApiKeyDoc = InferSchemaType<typeof apiKeySchema>

export const ApiKeyModel = models.ApiKey ?? model('ApiKey', apiKeySchema)
