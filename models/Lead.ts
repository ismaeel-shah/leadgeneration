import mongoose, { type Model, Schema, Types } from "mongoose";

export const leadStages = [
  "request_sent", "accepted", "messaged", "follow_up_1", "follow_up_2",
  "replied", "meeting", "won", "lost", "no_response", "withdrawn",
] as const;

export type LeadStage = (typeof leadStages)[number];

export const nextActionTypes = [
  "send_first_message", "follow_up", "reply", "close_or_retry",
  "check_conversation", "meeting",
] as const;

export type NextActionType = (typeof nextActionTypes)[number];

export interface ILead {
  userId: Types.ObjectId;
  profileId: Types.ObjectId;
  fullName: string;
  firstName: string;
  linkedinUrl: string;
  linkedinUrlNormalized: string;
  headline?: string;
  role?: string;
  company?: string;
  country: string;
  service?: string;
  tags: string[];
  email?: string;
  phone?: string;
  dealValue?: number;
  notes?: string;
  stage: LeadStage;
  followUpCount: number;
  requestSentAt: Date;
  acceptedAt?: Date;
  firstMessageAt?: Date;
  lastMessageAt?: Date;
  lastReplyAt?: Date;
  meetingAt?: Date;
  closedAt?: Date;
  nextActionType?: NextActionType;
  nextActionDueAt?: Date;
  lastActivityAt?: Date;
  stageChangedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const LeadSchema = new Schema<ILead>(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    profileId: { type: Schema.Types.ObjectId, required: true },
    fullName: { type: String, required: true, trim: true },
    firstName: { type: String, required: true, trim: true },
    linkedinUrl: { type: String, required: true, trim: true },
    linkedinUrlNormalized: { type: String, required: true, trim: true },
    headline: { type: String, trim: true },
    role: { type: String, trim: true },
    company: { type: String, trim: true },
    country: { type: String, required: true, uppercase: true, trim: true },
    service: { type: String, trim: true },
    tags: { type: [String], default: [] },
    email: { type: String, trim: true },
    phone: { type: String, trim: true },
    dealValue: { type: Number, min: 0 },
    notes: { type: String },
    stage: { type: String, enum: leadStages, default: "request_sent" },
    followUpCount: { type: Number, default: 0, min: 0 },
    requestSentAt: { type: Date, required: true },
    acceptedAt: Date,
    firstMessageAt: Date,
    lastMessageAt: Date,
    lastReplyAt: Date,
    meetingAt: Date,
    closedAt: Date,
    nextActionType: { type: String, enum: nextActionTypes },
    nextActionDueAt: Date,
    lastActivityAt: Date,
    stageChangedAt: Date,
  },
  { timestamps: true },
);

LeadSchema.index({ userId: 1, linkedinUrlNormalized: 1 });
LeadSchema.index({ userId: 1, nextActionDueAt: 1 });
LeadSchema.index({ userId: 1, stage: 1, profileId: 1 });
LeadSchema.index({ userId: 1, country: 1 });
LeadSchema.index({ userId: 1, lastActivityAt: -1 });
LeadSchema.index({ userId: 1, createdAt: -1 });
LeadSchema.index({ fullName: "text", company: "text" });

const Lead = (mongoose.models.Lead || mongoose.model<ILead>("Lead", LeadSchema)) as Model<ILead>;
export default Lead;
