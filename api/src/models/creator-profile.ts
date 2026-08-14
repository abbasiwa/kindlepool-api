import { Schema, model, models, type InferSchemaType } from 'mongoose'

const creatorProfileSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    handle: { type: String, required: true, unique: true, index: true, trim: true, lowercase: true },
    walletAddress: { type: String, required: true, unique: true, index: true },
    displayName: { type: String, default: '' },
    bio: { type: String, default: '', maxlength: 1000 },
    avatarUrl: { type: String, default: '' },
    // Embed theme customization (future .io)
    accentColor: { type: String, default: '#3D3DFF' },
    published: { type: Boolean, default: false },
  },
  { timestamps: true },
)

export type CreatorProfileDoc = InferSchemaType<typeof creatorProfileSchema>

export const CreatorProfileModel = models.CreatorProfile ?? model('CreatorProfile', creatorProfileSchema)
