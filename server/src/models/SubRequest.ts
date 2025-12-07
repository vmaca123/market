import { Schema, model, Types, Document } from 'mongoose'

export interface ISubRequest extends Document {
  scheduleId: Types.ObjectId
  requester: Types.ObjectId
  substitute: Types.ObjectId | null
  requesterName: string
  substituteName?: string
  reason?: string
  status:
    | 'requested'
    | 'approved_by_owner'
    | 'accepted_by_sub'
    | 'approved_final'
    | 'cancelled'
}

const subRequestSchema = new Schema<ISubRequest>(
  {
    scheduleId: {
      type: Types.ObjectId,
      ref: 'Schedule',
      required: true,
    },
    requester: {
      type: Types.ObjectId,
      ref: 'User',
      required: true,
    },
    substitute: {
      type: Types.ObjectId,
      ref: 'User',
      default: null,
    },
    requesterName: {
      type: String,
      required: true,
    },
    substituteName: {
      type: String,
      default: '',
    },
    reason: {
      type: String,
      required: false,
      default: '',
    },
    status: {
      type: String,
      enum: [
        'requested',
        'approved_by_owner',
        'accepted_by_sub',
        'approved_final',
        'cancelled',
      ],
      default: 'requested',
    },
  },
  { timestamps: true }
)

export default model<ISubRequest>('SubRequest', subRequestSchema)
