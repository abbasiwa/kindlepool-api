import { Schema, model, models, type InferSchemaType } from 'mongoose'

const workEntrySchema = new Schema(
  {
    creatorId: { type: Schema.Types.ObjectId, ref: 'CreatorProfile', required: true, index: true },
    slug: { type: String, required: true, index: true },
    title: { type: String, required: true, default: '' },
    description: { type: String, default: '' },
    url: { type: String, default: '' },
    coverUrl: { type: String, default: '' },
    // Tag id from the on-chain tag system (future .io)
    tagId: { type: Number, default: null },
    totalReceived: { type: String, default: '0' },
    published: { type: Boolean, default: false },
  },
  { timestamps: true },
)

workEntrySchema.index({ creatorId: 1, slug: 1 }, { unique: true })

export type WorkEntryDoc = InferSchemaType<typeof workEntrySchema>

export const WorkEntryModel = models.WorkEntry ?? model('WorkEntry', workEntrySchema)
