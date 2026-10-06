import mongoose, { type Model, Schema, Types } from "mongoose";
import { profileColors } from "@/lib/constants";

export { profileColors };

export interface IProfile {
  userId: Types.ObjectId;
  name: string;
  linkedinUrl?: string;
  color: (typeof profileColors)[number];
  dailyConnectionTarget: number;
  dailyCommentTarget: number;
  weeklyInviteLimit: number;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const ProfileSchema = new Schema<IProfile>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    name: { type: String, required: true, trim: true },
    linkedinUrl: { type: String, trim: true },
    color: { type: String, enum: profileColors, default: "blue" },
    dailyConnectionTarget: { type: Number, default: 35, min: 0 },
    dailyCommentTarget: { type: Number, default: 10, min: 0 },
    weeklyInviteLimit: { type: Number, default: 100, min: 1 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

ProfileSchema.index({ userId: 1, isActive: 1, name: 1 });

const Profile = (mongoose.models.Profile || mongoose.model<IProfile>("Profile", ProfileSchema)) as Model<IProfile>;
export default Profile;
