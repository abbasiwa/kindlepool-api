import { Schema, model, models, type InferSchemaType } from 'mongoose'

const subscriptionSchema = new Schema(
  {
    address: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    events: { type: [String], default: ['deposit', 'goal_reached', 'work_submitted', 'vote_cast', 'pool_paid', 'pool_refunded'] },
  },
  { timestamps: true },
)

export type SubscriptionDoc = InferSchemaType<typeof subscriptionSchema>

export const SubscriptionModel = models.Subscription ?? model('Subscription', subscriptionSchema)
