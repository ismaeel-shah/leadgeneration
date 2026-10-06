import mongoose, { type Model, Schema, Types } from "mongoose";

export const activityTypes = [
  "request_sent", "accepted", "first_message", "follow_up", "replied",
  "user_replied", "meeting_booked", "won", "lost", "no_response",
  "withdrawn", "comment", "note",
] as const;

export type ActivityType = (typeof activityTypes)[number];

export interface IActivity {
  userId: Types.ObjectId;
  profileId: Types.ObjectId;
  leadId?: Types.ObjectId;
  type: ActivityType;
  meta?: Record<string, unknown>;
  occurredAt: Date;
  createdAt?: Date;
}

const ActivitySchema = new Schema<IActivity>(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    profileId: { type: Schema.Types.ObjectId, required: true },
    leadId: Schema.Types.ObjectId,
    type: { type: String, enum: activityTypes, required: true },
    meta: { type: Schema.Types.Mixed },
    occurredAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

ActivitySchema.index({ userId: 1, occurredAt: -1 });
ActivitySchema.index({ userId: 1, profileId: 1, type: 1, occurredAt: -1 });
ActivitySchema.index({ leadId: 1, occurredAt: -1 });

const Activity = (mongoose.models.Activity || mongoose.model<IActivity>("Activity", ActivitySchema)) as Model<IActivity>;
export default Activity;
