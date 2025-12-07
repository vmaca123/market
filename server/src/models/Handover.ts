import mongoose, { Schema, Document } from 'mongoose';

export interface IHandover extends Document {
  writer: mongoose.Types.ObjectId; // User (Staff) who wrote this
  content: string;
  checklist: { item: string; done: boolean }[];
  confirmed: boolean;
  confirmedBy: mongoose.Types.ObjectId[]; // Array of Users who confirmed
  isImportant: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const HandoverSchema: Schema = new Schema(
  {
    writer: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true },
    checklist: [
      {
        item: { type: String, required: true },
        done: { type: Boolean, default: false },
      },
    ],
    confirmed: { type: Boolean, default: false },
    confirmedBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    isImportant: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.model<IHandover>('Handover', HandoverSchema);
