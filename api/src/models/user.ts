import { Schema, model, models, type InferSchemaType } from 'mongoose'

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    emailVerified: { type: Boolean, default: false },
    displayName: { type: String, default: '' },
    bio: { type: String, default: '', maxlength: 500 },
    avatarUrl: { type: String, default: '' },
    slug: { type: String, default: '' },
    // Primary Stellar address linked in Settings (wallet-link)
    walletAddress: { type: String, default: null },
    // walletAddress(es) linked but not primary
    linkedWallets: { type: [String], default: [] },
    lastLoginAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
)

userSchema.index({ slug: 1 }, { unique: true, sparse: true })

export type UserDoc = InferSchemaType<typeof userSchema>

export const UserModel = models.User ?? model('User', userSchema)
