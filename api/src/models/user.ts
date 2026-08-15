import { Schema, model, models, type InferSchemaType } from 'mongoose'

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    emailVerified: { type: Boolean, default: false },
    displayName: { type: String, default: '' },
    bio: { type: String, default: '', maxlength: 500 },
    avatarUrl: { type: String, default: '' },
    // Notification/UI preferences
    preferences: { type: Schema.Types.Mixed, default: {} },
    // Primary Stellar address linked in Settings (wallet-link)
    walletAddress: { type: String, default: null },
    // walletAddress(es) linked but not primary
    linkedWallets: { type: [String], default: [] },
    lastLoginAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
    // Magic-link authentication
    magicLinkToken: { type: String, default: null },
    magicLinkExpiresAt: { type: Date, default: null },
    // Wallet-link challenge (one-time nonce, 5-min expiry)
    walletChallenge: { type: String, default: null },
    walletChallengeExpiresAt: { type: Date, default: null },
    // Sessions (session tokens, last-24 revoked)
    sessionTokens: { type: [String], default: [] },
  },
  { timestamps: true },
)

userSchema.index({ magicLinkToken: 1 }, { sparse: true })

export type UserDoc = InferSchemaType<typeof userSchema>

export const UserModel = models.User ?? model('User', userSchema)
