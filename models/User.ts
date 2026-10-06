import mongoose, { type Model, Schema } from "mongoose";

export interface UserSettings {
  timezone: string;
  followUpGapDays: number;
  maxFollowUps: number;
  staleRequestDays: number;
  countries: string[];
  services: string[];
  tags: string[];
  theme: "system" | "light" | "dark";
}

export interface IUser {
  name: string;
  email: string;
  passwordHash: string;
  settings: UserSettings;
  createdAt?: Date;
  updatedAt?: Date;
}

export const defaultUserSettings: UserSettings = {
  timezone: "Asia/Karachi",
  followUpGapDays: 3,
  maxFollowUps: 2,
  staleRequestDays: 21,
  countries: [],
  services: [],
  tags: [],
  theme: "system",
};

const UserSettingsSchema = new Schema<UserSettings>(
  {
    timezone: { type: String, default: defaultUserSettings.timezone },
    followUpGapDays: { type: Number, default: defaultUserSettings.followUpGapDays, min: 1 },
    maxFollowUps: { type: Number, default: defaultUserSettings.maxFollowUps, min: 1 },
    staleRequestDays: { type: Number, default: defaultUserSettings.staleRequestDays, min: 1 },
    countries: { type: [String], default: [] },
    services: { type: [String], default: [] },
    tags: { type: [String], default: [] },
    theme: { type: String, enum: ["system", "light", "dark"], default: "system" },
  },
  { _id: false },
);

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true, unique: true },
    passwordHash: { type: String, required: true, select: false },
    settings: { type: UserSettingsSchema, default: () => ({ ...defaultUserSettings }) },
  },
  { timestamps: true },
);

const User = (mongoose.models.User || mongoose.model<IUser>("User", UserSchema)) as Model<IUser>;
export default User;
