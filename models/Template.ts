import mongoose, { type Model, Schema, Types } from "mongoose";

export const templateTypes = [
  "connection_note", "first_message", "follow_up_1", "follow_up_2", "other",
] as const;

export interface ITemplate {
  userId: Types.ObjectId;
  name: string;
  type: (typeof templateTypes)[number];
  country?: string;
  service?: string;
  isDefault: boolean;
  body: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const TemplateSchema = new Schema<ITemplate>(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: templateTypes, required: true },
    country: { type: String, uppercase: true, trim: true },
    service: { type: String, trim: true },
    isDefault: { type: Boolean, default: false },
    body: { type: String, required: true },
  },
  { timestamps: true },
);

TemplateSchema.index({ userId: 1, type: 1, country: 1, service: 1 });

const Template = (mongoose.models.Template || mongoose.model<ITemplate>("Template", TemplateSchema)) as Model<ITemplate>;
export default Template;
