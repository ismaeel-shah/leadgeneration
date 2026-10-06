"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Types } from "mongoose";
import { requireUserId } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { startOfDay } from "@/lib/dates";
import Activity from "@/models/Activity";
import Comment from "@/models/Comment";
import Lead from "@/models/Lead";
import Profile, { profileColors } from "@/models/Profile";
import User, { defaultUserSettings } from "@/models/User";
import type { ActionResult } from "./types";
import { actionError } from "./types";

const profileSchema = z.object({
  name: z.string().trim().min(1).max(100),
  linkedinUrl: z.union([z.string().trim().url(), z.literal("")]).optional(),
  color: z.enum(profileColors).default("blue"),
  dailyConnectionTarget: z.number().int().min(0).max(1000).default(35),
  dailyCommentTarget: z.number().int().min(0).max(1000).default(10),
  weeklyInviteLimit: z.number().int().min(1).max(10000).default(100),
  isActive: z.boolean().default(true),
});

// Zod preserves .default() when an object is made partial. Keep the update
// schema separate so omitted fields do not reset saved targets or colour.
const profilePatchSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  linkedinUrl: z.union([z.string().trim().url(), z.literal("")]).optional(),
  color: z.enum(profileColors).optional(),
  dailyConnectionTarget: z.number().int().min(0).max(1000).optional(),
  dailyCommentTarget: z.number().int().min(0).max(1000).optional(),
  weeklyInviteLimit: z.number().int().min(1).max(10000).optional(),
  isActive: z.boolean().optional(),
});

export type ProfileInput = z.input<typeof profileSchema>;
export type ProfileDTO = {
  id: string;
  name: string;
  linkedinUrl?: string;
  color: (typeof profileColors)[number];
  dailyConnectionTarget: number;
  dailyCommentTarget: number;
  weeklyInviteLimit: number;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
};

type ProfileRecord = {
  _id: Types.ObjectId;
  name: string;
  linkedinUrl?: string;
  color: ProfileDTO["color"];
  dailyConnectionTarget: number;
  dailyCommentTarget: number;
  weeklyInviteLimit: number;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
};

function toProfileDTO(profile: ProfileRecord): ProfileDTO {
  return {
    id: String(profile._id),
    name: profile.name,
    linkedinUrl: profile.linkedinUrl || undefined,
    color: profile.color,
    dailyConnectionTarget: profile.dailyConnectionTarget,
    dailyCommentTarget: profile.dailyCommentTarget,
    weeklyInviteLimit: profile.weeklyInviteLimit,
    isActive: profile.isActive,
    createdAt: profile.createdAt?.toISOString(),
    updatedAt: profile.updatedAt?.toISOString(),
  };
}

export async function listProfiles(): Promise<ProfileDTO[]> {
  const userId = await requireUserId();
  await connectDB();
  const profiles = await Profile.find({ userId }).sort({ isActive: -1, name: 1 }).lean();
  return profiles.map((profile) => toProfileDTO(profile as ProfileRecord));
}

export async function createProfile(input: ProfileInput): Promise<ActionResult<ProfileDTO>> {
  try {
    const userId = await requireUserId();
    const parsed = profileSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the profile details." };
    await connectDB();
    const profile = await Profile.create({ userId, ...parsed.data });
    revalidatePath("/profiles");
    revalidatePath("/");
    return { ok: true, data: toProfileDTO(profile.toObject() as ProfileRecord) };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateProfile(id: string, input: Partial<ProfileInput>): Promise<ActionResult<ProfileDTO>> {
  try {
    const userId = await requireUserId();
    if (!Types.ObjectId.isValid(id)) return { ok: false, error: "Profile not found." };
    const parsed = profilePatchSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the profile details." };
    await connectDB();
    const profile = await Profile.findOneAndUpdate(
      { _id: new Types.ObjectId(id), userId },
      { $set: parsed.data },
      { returnDocument: "after", runValidators: true },
    ).lean();
    if (!profile) return { ok: false, error: "Profile not found." };
    revalidatePath("/profiles");
    revalidatePath("/");
    revalidatePath("/leads");
    return { ok: true, data: toProfileDTO(profile as ProfileRecord) };
  } catch (error) {
    return actionError(error);
  }
}

export async function deleteProfile(id: string): Promise<ActionResult<{ id: string; deactivated: boolean }>> {
  try {
    const userId = await requireUserId();
    if (!Types.ObjectId.isValid(id)) return { ok: false, error: "Profile not found." };
    const db = await connectDB();
    const _id = new Types.ObjectId(id);
    let deactivated = false;
    await db.connection.transaction(async (session) => {
      const profile = await Profile.findOne({ _id, userId }).session(session);
      if (!profile) throw new Error("Profile not found.");
      const [hasLeads, hasComments, hasActivities] = await Promise.all([
        Lead.exists({ userId, profileId: _id }).session(session),
        Comment.exists({ userId, profileId: _id }).session(session),
        Activity.exists({ userId, profileId: _id }).session(session),
      ]);
      if (hasLeads || hasComments || hasActivities) {
        await Profile.updateOne({ _id, userId }, { $set: { isActive: false } }, { session });
        deactivated = true;
      } else {
        await Profile.deleteOne({ _id, userId }, { session });
      }
    });
    revalidatePath("/profiles");
    revalidatePath("/");
    return { ok: true, data: { id, deactivated } };
  } catch (error) {
    return actionError(error);
  }
}

export type ProfileProgressDTO = ProfileDTO & {
  requestsToday: number;
  commentsToday: number;
  requestsLast7Days: number;
  requestsLast30Days: number;
  acceptedLast30Days: number;
  firstMessagesLast30Days: number;
  repliesLast30Days: number;
  meetingsLast30Days: number;
  pendingRequests: number;
  acceptanceRate: number;
  replyRate: number;
  weeklyWarning: "none" | "amber" | "red";
};

export async function getProfileProgress(profileId?: string, options: { includeInactive?: boolean } = {}): Promise<ProfileProgressDTO[]> {
  const userId = await requireUserId();
  if (profileId && !Types.ObjectId.isValid(profileId)) return [];
  await connectDB();
  const profileQuery = {
    userId,
    ...(options.includeInactive ? {} : { isActive: true }),
    ...(profileId ? { _id: new Types.ObjectId(profileId) } : {}),
  };
  const [profiles, user] = await Promise.all([
    Profile.find(profileQuery).sort({ name: 1 }).lean(),
    User.findOne({ _id: userId }).select("settings.timezone").lean(),
  ]);
  const now = new Date();
  const todayStart = startOfDay(now, user?.settings?.timezone || defaultUserSettings.timezone);
  const weekStart = new Date(now.getTime() - 7 * 86400000);
  const thirtyStart = new Date(now.getTime() - 30 * 86400000);
  const activityMatch = {
    userId,
    occurredAt: { $gte: thirtyStart },
    ...(profileId ? { profileId: new Types.ObjectId(profileId) } : {}),
  };
  const [counts, pending] = await Promise.all([Activity.aggregate<{
    _id: Types.ObjectId;
    requestsToday: number;
    commentsToday: number;
    requestsLast7Days: number;
    requestsLast30Days: number;
    acceptedLast30Days: number;
    firstMessagesLast30Days: number;
    repliesLast30Days: number;
    meetingsLast30Days: number;
  }>([
    { $match: activityMatch },
    { $group: {
      _id: "$profileId",
      requestsToday: { $sum: { $cond: [{ $and: [{ $eq: ["$type", "request_sent"] }, { $gte: ["$occurredAt", todayStart] }] }, 1, 0] } },
      commentsToday: { $sum: { $cond: [{ $and: [{ $eq: ["$type", "comment"] }, { $gte: ["$occurredAt", todayStart] }] }, 1, 0] } },
      requestsLast7Days: { $sum: { $cond: [{ $and: [{ $eq: ["$type", "request_sent"] }, { $gte: ["$occurredAt", weekStart] }] }, 1, 0] } },
      requestsLast30Days: { $sum: { $cond: [{ $eq: ["$type", "request_sent"] }, 1, 0] } },
      acceptedLast30Days: { $sum: { $cond: [{ $eq: ["$type", "accepted"] }, 1, 0] } },
      firstMessagesLast30Days: { $sum: { $cond: [{ $eq: ["$type", "first_message"] }, 1, 0] } },
      repliesLast30Days: { $sum: { $cond: [{ $eq: ["$type", "replied"] }, 1, 0] } },
      meetingsLast30Days: { $sum: { $cond: [{ $eq: ["$type", "meeting_booked"] }, 1, 0] } },
    } },
  ]), Lead.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $match: { userId, stage: "request_sent", ...(profileId ? { profileId: new Types.ObjectId(profileId) } : {}) } },
    { $group: { _id: "$profileId", count: { $sum: 1 } } },
  ])]);
  const byProfile = new Map(counts.map((count) => [String(count._id), count]));
  const pendingByProfile = new Map(pending.map((entry) => [String(entry._id), entry.count]));
  return profiles.map((profile) => {
    const dto = toProfileDTO(profile as ProfileRecord);
    const count = byProfile.get(dto.id);
    const requestsLast7Days = count?.requestsLast7Days ?? 0;
    return {
      ...dto,
      requestsToday: count?.requestsToday ?? 0,
      commentsToday: count?.commentsToday ?? 0,
      requestsLast7Days,
      requestsLast30Days: count?.requestsLast30Days ?? 0,
      acceptedLast30Days: count?.acceptedLast30Days ?? 0,
      firstMessagesLast30Days: count?.firstMessagesLast30Days ?? 0,
      repliesLast30Days: count?.repliesLast30Days ?? 0,
      meetingsLast30Days: count?.meetingsLast30Days ?? 0,
      pendingRequests: pendingByProfile.get(dto.id) ?? 0,
      acceptanceRate: count?.requestsLast30Days ? Math.round(100 * count.acceptedLast30Days / count.requestsLast30Days) : 0,
      replyRate: count?.firstMessagesLast30Days ? Math.round(100 * count.repliesLast30Days / count.firstMessagesLast30Days) : 0,
      weeklyWarning: requestsLast7Days >= dto.weeklyInviteLimit ? "red" as const :
        requestsLast7Days >= 0.8 * dto.weeklyInviteLimit ? "amber" as const : "none" as const,
    };
  });
}
