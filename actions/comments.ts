"use server";

import { revalidatePath } from "next/cache";
import { Types } from "mongoose";
import { z } from "zod";
import { requireUserId } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { calendarDayKey, startOfDay, DEFAULT_TIMEZONE } from "@/lib/dates";
import Activity from "@/models/Activity";
import Comment from "@/models/Comment";
import Lead from "@/models/Lead";
import Profile from "@/models/Profile";
import User from "@/models/User";
import type { ActionResult } from "./types";
import { actionError } from "./types";

const commentSchema = z.object({
  profileId: z.string().refine((value) => Types.ObjectId.isValid(value), "Choose a profile."),
  leadId: z.string().optional(),
  postUrl: z.string().trim().url("Enter a valid post URL.").refine((value) => {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && (url.hostname === "linkedin.com" || url.hostname.endsWith(".linkedin.com"));
  }, "Enter a LinkedIn post URL."),
  postAuthorName: z.string().trim().max(120).optional(),
  note: z.string().trim().max(2000).optional(),
  commentedAt: z.string().refine((value) => !Number.isNaN(new Date(value).getTime()), "Choose a valid comment time.").optional(),
});

export type CommentInput = z.input<typeof commentSchema>;
export type CommentDTO = {
  id: string;
  profileId: string;
  leadId?: string;
  leadName?: string;
  postUrl: string;
  postAuthorName?: string;
  note?: string;
  commentedAt: string;
  dayKey: string;
};
export type CommentPage = {
  items: CommentDTO[];
  nextCursor?: string;
  timezone: string;
  progress: Record<string, number>;
};
export type CommentLeadOption = { id: string; fullName: string; company?: string };

type CommentRecord = {
  _id: Types.ObjectId;
  profileId: Types.ObjectId;
  leadId?: Types.ObjectId;
  postUrl: string;
  postAuthorName?: string;
  note?: string;
  commentedAt: Date;
};

function validId(id?: string): id is string {
  return !!id && Types.ObjectId.isValid(id);
}

export async function listComments(input: { profileId?: string; cursor?: string } = {}): Promise<CommentPage> {
  const userId = await requireUserId();
  await connectDB();
  const user = await User.findOne({ _id: userId }).select("settings.timezone").lean();
  const timezone = user?.settings?.timezone || DEFAULT_TIMEZONE;
  const dayStart = startOfDay(new Date(), timezone);
  const scope: Record<string, unknown> = { userId };
  if (input.profileId) {
    if (!validId(input.profileId)) return { items: [], timezone, progress: {} };
    scope.profileId = new Types.ObjectId(input.profileId);
  }
  if (input.cursor) {
    if (!validId(input.cursor)) return { items: [], timezone, progress: {} };
    const cursor = await Comment.findOne({ _id: new Types.ObjectId(input.cursor), userId }).select("commentedAt").lean();
    if (!cursor) return { items: [], timezone, progress: {} };
    scope.$or = [
      { commentedAt: { $lt: cursor.commentedAt } },
      { commentedAt: cursor.commentedAt, _id: { $lt: cursor._id } },
    ];
  }

  const [records, counts] = await Promise.all([
    Comment.find(scope).sort({ commentedAt: -1, _id: -1 }).limit(41).lean(),
    Activity.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $match: { userId, type: "comment", occurredAt: { $gte: dayStart } } },
      { $group: { _id: "$profileId", count: { $sum: 1 } } },
    ]),
  ]);
  const pageRecords = records.slice(0, 40) as CommentRecord[];
  const leadIds = pageRecords.map((record) => record.leadId).filter((id): id is Types.ObjectId => !!id);
  const leads = leadIds.length
    ? await Lead.find({ userId, _id: { $in: leadIds } }).select("fullName").lean()
    : [];
  const leadNames = new Map(leads.map((lead) => [String(lead._id), lead.fullName]));

  return {
    items: pageRecords.map((record) => ({
      id: String(record._id),
      profileId: String(record.profileId),
      leadId: record.leadId ? String(record.leadId) : undefined,
      leadName: record.leadId ? leadNames.get(String(record.leadId)) : undefined,
      postUrl: record.postUrl,
      postAuthorName: record.postAuthorName || undefined,
      note: record.note || undefined,
      commentedAt: record.commentedAt.toISOString(),
      dayKey: calendarDayKey(record.commentedAt, timezone),
    })),
    nextCursor: records.length > 40 ? String(pageRecords.at(-1)?._id) : undefined,
    timezone,
    progress: Object.fromEntries(counts.map(({ _id, count }) => [String(_id), count])),
  };
}

export async function searchCommentLeads(input: { profileId?: string; query: string }): Promise<CommentLeadOption[]> {
  const userId = await requireUserId();
  const query = input.query.trim().slice(0, 100);
  if (query.length < 2) return [];
  if (input.profileId && !validId(input.profileId)) return [];
  await connectDB();
  const safe = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const leads = await Lead.find({
    userId,
    ...(input.profileId ? { profileId: new Types.ObjectId(input.profileId) } : {}),
    $or: [{ fullName: { $regex: safe, $options: "i" } }, { company: { $regex: safe, $options: "i" } }],
  }).select("fullName company").sort({ fullName: 1 }).limit(12).lean();
  return leads.map((lead) => ({ id: String(lead._id), fullName: lead.fullName, company: lead.company || undefined }));
}

export async function createComment(input: CommentInput): Promise<ActionResult<CommentDTO>> {
  try {
    const userId = await requireUserId();
    const parsed = commentSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the comment details." };
    const data = parsed.data;
    const profileId = new Types.ObjectId(data.profileId);
    if (data.leadId && !validId(data.leadId)) return { ok: false, error: "Linked lead not found." };
    const leadId = data.leadId ? new Types.ObjectId(data.leadId) : undefined;
    const db = await connectDB();
    const profile = await Profile.exists({ _id: profileId, userId });
    if (!profile) return { ok: false, error: "Profile not found." };
    let leadName: string | undefined;
    if (leadId) {
      const lead = await Lead.findOne({ _id: leadId, userId, profileId }).select("fullName").lean();
      if (!lead) return { ok: false, error: "Choose a lead from this profile." };
      leadName = lead.fullName;
    }
    const commentedAt = data.commentedAt ? new Date(data.commentedAt) : new Date();
    const session = await db.startSession();
    let comment: CommentRecord | undefined;
    try {
      await session.withTransaction(async () => {
        const created = await Comment.create([{
          userId,
          profileId,
          leadId,
          postUrl: data.postUrl,
          postAuthorName: data.postAuthorName || undefined,
          note: data.note || undefined,
          commentedAt,
        }], { session });
        comment = created[0].toObject() as CommentRecord;
        await Activity.create([{
          userId,
          profileId,
          leadId,
          type: "comment",
          occurredAt: commentedAt,
          meta: { commentId: String(comment._id) },
        }], { session });
      });
    } finally {
      await session.endSession();
    }
    if (!comment) return { ok: false, error: "The comment could not be saved. Please try again." };
    const timezone = (await User.findOne({ _id: userId }).select("settings.timezone").lean())?.settings?.timezone || DEFAULT_TIMEZONE;
    revalidatePath("/comments");
    revalidatePath("/");
    revalidatePath("/reports");
    return { ok: true, data: {
      id: String(comment._id),
      profileId: data.profileId,
      leadId: data.leadId || undefined,
      leadName,
      postUrl: comment.postUrl,
      postAuthorName: comment.postAuthorName || undefined,
      note: comment.note || undefined,
      commentedAt: comment.commentedAt.toISOString(),
      dayKey: calendarDayKey(comment.commentedAt, timezone),
    } };
  } catch (error) {
    return actionError(error);
  }
}

export async function deleteComment(id: string): Promise<ActionResult<{ id: string }>> {
  try {
    const userId = await requireUserId();
    if (!validId(id)) return { ok: false, error: "Comment not found." };
    const db = await connectDB();
    const session = await db.startSession();
    let removed = false;
    try {
      await session.withTransaction(async () => {
        const comment = await Comment.findOneAndDelete({ _id: new Types.ObjectId(id), userId }, { session });
        if (!comment) return;
        removed = true;
        await Activity.deleteOne({ userId, type: "comment", "meta.commentId": id }, { session });
      });
    } finally {
      await session.endSession();
    }
    if (!removed) return { ok: false, error: "Comment not found." };
    revalidatePath("/comments");
    revalidatePath("/");
    revalidatePath("/reports");
    return { ok: true, data: { id } };
  } catch (error) {
    return actionError(error);
  }
}
