"use server";

import { revalidatePath } from "next/cache";
import { Types } from "mongoose";
import { z } from "zod";
import { requireUserId } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { addCalendarDays, startOfDay } from "@/lib/dates";
import { parseLinkedInProfileUrl } from "@/lib/linkedin-url";
import {
  applyTransition, createUndoUpdates,
  type LeadTransitionState, type TransitionAction,
  type TransitionActionName,
} from "@/lib/rules";
import Activity from "@/models/Activity";
import Comment from "@/models/Comment";
import Lead, { type ILead, type LeadStage, type NextActionType } from "@/models/Lead";
import Profile from "@/models/Profile";
import User, { defaultUserSettings } from "@/models/User";
import { todayQueueFilter } from "@/queries/today";
import { leadSortKeys, type LeadSortKey } from "@/lib/constants";
import type { ActionResult } from "./types";
import { actionError } from "./types";

const objectId = z.string().refine((value) => Types.ObjectId.isValid(value), "Choose a valid profile.");
const leadInputSchema = z.object({
  profileId: objectId,
  linkedinUrl: z.string().trim().min(1),
  fullName: z.string().trim().min(1).max(200).optional(),
  country: z.string().trim().regex(/^[a-z]{2}$/i).transform((value) => value.toUpperCase()),
  service: z.string().trim().max(100).optional(),
  role: z.string().trim().max(150).optional(),
  company: z.string().trim().max(150).optional(),
  headline: z.string().trim().max(300).optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(30).optional(),
  allowDuplicate: z.boolean().optional(),
});

const bulkInputSchema = z.object({
  urls: z.array(z.string()).min(1).max(100),
  profileId: objectId,
  country: z.string().trim().regex(/^[a-z]{2}$/i).transform((value) => value.toUpperCase()),
  service: z.string().trim().max(100).optional(),
  allowDuplicates: z.boolean().optional(),
});

export type CreateLeadInput = z.input<typeof leadInputSchema>;
export type CreateLeadsBulkInput = z.input<typeof bulkInputSchema>;
export type LeadDTO = {
  id: string;
  profileId: string;
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
  requestSentAt: string;
  acceptedAt?: string;
  firstMessageAt?: string;
  lastMessageAt?: string;
  lastReplyAt?: string;
  meetingAt?: string;
  closedAt?: string;
  nextActionType?: NextActionType;
  nextActionDueAt?: string;
  lastActivityAt: string;
  stageChangedAt: string;
  createdAt?: string;
  updatedAt?: string;
};

type LeadRecord = ILead & { _id: Types.ObjectId; __v?: number };
type ActivityRecord = { _id: Types.ObjectId; profileId: Types.ObjectId; type: string; occurredAt: Date; meta?: Record<string, unknown> };

function iso(value?: Date | null): string | undefined {
  return value ? new Date(value).toISOString() : undefined;
}

function toLeadDTO(lead: LeadRecord): LeadDTO {
  return {
    id: String(lead._id),
    profileId: String(lead.profileId),
    fullName: lead.fullName,
    firstName: lead.firstName,
    linkedinUrl: lead.linkedinUrl,
    linkedinUrlNormalized: lead.linkedinUrlNormalized,
    headline: lead.headline,
    role: lead.role,
    company: lead.company,
    country: lead.country,
    service: lead.service,
    tags: lead.tags ?? [],
    email: lead.email,
    phone: lead.phone,
    dealValue: lead.dealValue,
    notes: lead.notes,
    stage: lead.stage,
    followUpCount: lead.followUpCount,
    requestSentAt: lead.requestSentAt.toISOString(),
    acceptedAt: iso(lead.acceptedAt),
    firstMessageAt: iso(lead.firstMessageAt),
    lastMessageAt: iso(lead.lastMessageAt),
    lastReplyAt: iso(lead.lastReplyAt),
    meetingAt: iso(lead.meetingAt),
    closedAt: iso(lead.closedAt),
    nextActionType: lead.nextActionType ?? undefined,
    nextActionDueAt: iso(lead.nextActionDueAt),
    lastActivityAt: (lead.lastActivityAt ?? lead.requestSentAt).toISOString(),
    stageChangedAt: (lead.stageChangedAt ?? fallbackStageDate(lead)).toISOString(),
    createdAt: iso(lead.createdAt),
    updatedAt: iso(lead.updatedAt),
  };
}

/** For leads saved before `stageChangedAt` existed. */
function fallbackStageDate(lead: LeadRecord): Date {
  switch (lead.stage) {
    case "request_sent": return lead.requestSentAt;
    case "accepted": return lead.acceptedAt ?? lead.requestSentAt;
    case "messaged": return lead.firstMessageAt ?? lead.requestSentAt;
    case "replied": return lead.lastReplyAt ?? lead.requestSentAt;
    default: return lead.closedAt ?? lead.lastMessageAt ?? lead.updatedAt ?? lead.requestSentAt;
  }
}

function invalidateLeadViews(id?: string) {
  revalidatePath("/");
  revalidatePath("/leads");
  revalidatePath("/profiles");
  if (id) revalidatePath(`/leads/${id}`);
}

export type { LeadSortKey };

export type LeadListFilters = {
  profileId?: string;
  country?: string;
  service?: string;
  stage?: LeadStage;
  tag?: string;
  search?: string;
  hasOverdueAction?: boolean;
  /** Local calendar days (YYYY-MM-DD), inclusive, in the user's timezone. */
  addedFrom?: string;
  addedTo?: string;
  sort?: LeadSortKey;
  dir?: "asc" | "desc";
  page?: number;
  limit?: number;
};

export type LeadPage = { leads: LeadDTO[]; total: number; page: number; limit: number };

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function localDayStart(day: string | undefined, timezone: string): Date | undefined {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return undefined;
  const noonUtc = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(noonUtc.getTime())) return undefined;
  return startOfDay(noonUtc, timezone);
}

export async function listLeads(filters: LeadListFilters = {}): Promise<LeadPage> {
  const userId = await requireUserId();
  await connectDB();
  const page = Math.max(1, Math.floor(filters.page ?? 1));
  const limit = Math.min(500, Math.max(1, Math.floor(filters.limit ?? 50)));
  const query: Record<string, unknown> = { userId };
  if (filters.profileId) {
    if (!Types.ObjectId.isValid(filters.profileId)) return { leads: [], total: 0, page, limit };
    query.profileId = new Types.ObjectId(filters.profileId);
  }
  if (filters.country) query.country = filters.country.toUpperCase();
  if (filters.service) query.service = filters.service;
  if (filters.stage) query.stage = filters.stage;
  if (filters.tag) query.tags = filters.tag;
  if (filters.search?.trim()) {
    const regex = new RegExp(escapeRegex(filters.search.trim().slice(0, 100)), "i");
    query.$or = [{ fullName: regex }, { company: regex }, { linkedinUrl: regex }, { linkedinUrlNormalized: regex }];
  }
  const needsTimezone = filters.hasOverdueAction || filters.addedFrom || filters.addedTo;
  const timezone = needsTimezone
    ? (await User.findOne({ _id: userId }).select("settings.timezone").lean())?.settings?.timezone || defaultUserSettings.timezone
    : defaultUserSettings.timezone;
  if (filters.hasOverdueAction) query.nextActionDueAt = { $lt: startOfDay(new Date(), timezone) };
  const from = localDayStart(filters.addedFrom, timezone);
  const toStart = localDayStart(filters.addedTo, timezone);
  if (from || toStart) {
    query.createdAt = {
      ...(from ? { $gte: from } : {}),
      ...(toStart ? { $lt: addCalendarDays(toStart, 1, timezone) } : {}),
    };
  }
  const sortKey: LeadSortKey = filters.sort && leadSortKeys.includes(filters.sort) ? filters.sort : "lastActivityAt";
  const direction = filters.dir === "asc" ? 1 : -1;
  const [leads, total] = await Promise.all([
    Lead.find(query).sort({ [sortKey]: direction, _id: direction }).skip((page - 1) * limit).limit(limit).lean(),
    Lead.countDocuments(query),
  ]);
  return { leads: leads.map((lead) => toLeadDTO(lead as LeadRecord)), total, page, limit };
}

/** Values for the pipeline filter dropdowns: what's in use plus what Settings lists. */
export async function getLeadFilterOptions(): Promise<{ countries: string[]; services: string[]; tags: string[] }> {
  const userId = await requireUserId();
  await connectDB();
  const [countries, services, tags, user] = await Promise.all([
    Lead.distinct("country", { userId }),
    Lead.distinct("service", { userId }),
    Lead.distinct("tags", { userId }),
    User.findOne({ _id: userId }).select("settings.services settings.tags").lean(),
  ]);
  const merge = (...lists: unknown[][]) => [...new Set(lists.flat().filter((value): value is string => typeof value === "string" && !!value))].sort((a, b) => a.localeCompare(b));
  return {
    countries: merge(countries),
    services: merge(services, user?.settings?.services ?? []),
    tags: merge(tags, user?.settings?.tags ?? []),
  };
}

export async function searchLeads(term: string): Promise<{ id: string; fullName: string; company?: string }[]> {
  const userId = await requireUserId();
  const trimmed = term.trim().slice(0, 100);
  if (trimmed.length < 2) return [];
  await connectDB();
  const regex = new RegExp(escapeRegex(trimmed), "i");
  const leads = await Lead.find({ userId, $or: [{ fullName: regex }, { company: regex }, { linkedinUrl: regex }, { linkedinUrlNormalized: regex }] })
    .select("fullName company").sort({ lastActivityAt: -1 }).limit(8).lean();
  return leads.map((lead) => ({ id: String(lead._id), fullName: lead.fullName, company: lead.company || undefined }));
}

export async function getLead(id: string): Promise<LeadDTO | null> {
  const userId = await requireUserId();
  if (!Types.ObjectId.isValid(id)) return null;
  await connectDB();
  const lead = await Lead.findOne({ _id: new Types.ObjectId(id), userId }).lean();
  return lead ? toLeadDTO(lead as LeadRecord) : null;
}

export type LeadActivityDTO = {
  id: string;
  profileId: string;
  type: string;
  occurredAt: string;
  meta?: Record<string, unknown>;
};

export async function listLeadActivities(leadId: string): Promise<LeadActivityDTO[]> {
  const userId = await requireUserId();
  if (!Types.ObjectId.isValid(leadId)) return [];
  await connectDB();
  const _id = new Types.ObjectId(leadId);
  if (!(await Lead.exists({ _id, userId }))) return [];
  const activities = await Activity.find({ userId, leadId: _id }).sort({ occurredAt: -1, _id: -1 }).lean();
  return activities.map((activity) => {
    const record = activity as ActivityRecord;
    const { undoBefore: _undoBefore, undoFields: _undoFields, undoVersion: _undoVersion, ...visibleMeta } = record.meta ?? {};
    return {
      id: String(record._id),
      profileId: String(record.profileId),
      type: record.type,
      occurredAt: record.occurredAt.toISOString(),
      meta: JSON.parse(JSON.stringify(visibleMeta)) as Record<string, unknown>,
    };
  });
}

const optionalText = (max: number) => z.string().trim().max(max);
const leadPatchSchema = z.object({
  fullName: z.string().trim().min(1, "Enter the lead's name.").max(200),
  profileId: objectId,
  headline: optionalText(300),
  role: optionalText(150),
  company: optionalText(150),
  country: z.string().trim().regex(/^[a-z]{2}$/i, "Choose a country.").transform((value) => value.toUpperCase()),
  service: optionalText(100),
  tags: z.array(z.string().trim().min(1).max(50)).max(30),
  email: z.union([z.string().trim().email("Enter a valid email address."), z.literal("")]),
  phone: optionalText(80),
  dealValue: z.number().min(0, "Deal value can't be negative.").nullable(),
  notes: z.string().max(20000),
}).partial();

export type UpdateLeadInput = z.input<typeof leadPatchSchema>;

export async function updateLead(id: string, input: UpdateLeadInput): Promise<ActionResult<LeadDTO>> {
  try {
    const userId = await requireUserId();
    if (!Types.ObjectId.isValid(id)) return { ok: false, error: "Lead not found." };
    const parsed = leadPatchSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the lead details." };
    await connectDB();
    const $set: Record<string, unknown> = {};
    const $unset: Record<string, 1> = {};
    // Empty optional fields are removed rather than stored as "".
    for (const [key, value] of Object.entries(parsed.data)) {
      if (value === "" || value === null) $unset[key] = 1;
      else if (value !== undefined) $set[key] = value;
    }
    if (parsed.data.profileId) {
      const profileId = new Types.ObjectId(parsed.data.profileId);
      if (!(await Profile.exists({ _id: profileId, userId, isActive: true }))) {
        return { ok: false, error: "Choose an active profile you own." };
      }
      $set.profileId = profileId;
    }
    if (parsed.data.fullName) $set.firstName = parsed.data.fullName.split(/\s+/)[0];
    // Detail edits don't bump __v: undo and stage changes only guard pipeline fields.
    const lead = await Lead.findOneAndUpdate(
      { _id: new Types.ObjectId(id), userId },
      { $set, ...(Object.keys($unset).length ? { $unset } : {}) },
      { returnDocument: "after", runValidators: true },
    ).lean();
    if (!lead) return { ok: false, error: "Lead not found." };
    invalidateLeadViews(id);
    return { ok: true, data: toLeadDTO(lead as LeadRecord) };
  } catch (error) {
    return actionError(error);
  }
}

export async function deleteLead(id: string): Promise<ActionResult<{ id: string }>> {
  try {
    const userId = await requireUserId();
    if (!Types.ObjectId.isValid(id)) return { ok: false, error: "Lead not found." };
    const db = await connectDB();
    const _id = new Types.ObjectId(id);
    await db.connection.transaction(async (session) => {
      const lead = await Lead.findOneAndDelete({ _id, userId }, { session });
      if (!lead) throw new Error("Lead not found.");
      await Activity.deleteMany({ userId, leadId: _id, type: { $ne: "comment" } }, { session });
      await Activity.updateMany({ userId, leadId: _id, type: "comment" }, { $unset: { leadId: 1 } }, { session });
      await Comment.updateMany({ userId, leadId: _id }, { $unset: { leadId: 1 } }, { session });
    });
    invalidateLeadViews(id);
    return { ok: true, data: { id } };
  } catch (error) {
    return actionError(error);
  }
}

export async function findDuplicateLead(url: string): Promise<LeadDTO | null> {
  const userId = await requireUserId();
  const parsed = parseLinkedInProfileUrl(url);
  if (!parsed) return null;
  await connectDB();
  const lead = await Lead.findOne({ userId, linkedinUrlNormalized: parsed.normalizedUrl }).lean();
  return lead ? toLeadDTO(lead as LeadRecord) : null;
}

const leadIdsSchema = z.array(z.string().refine((value) => Types.ObjectId.isValid(value))).min(1, "Select at least one lead.").max(500);

export type BulkResult = { updated: number; failed: { id: string; fullName: string; error: string }[] };

/** Applies one pipeline action to many leads; leads where it isn't allowed are reported back. */
export async function bulkTransitionLeads(ids: string[], action: TransitionActionName): Promise<ActionResult<BulkResult>> {
  try {
    await requireUserId();
    const parsed = leadIdsSchema.safeParse(ids);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Select leads first." };
    if (!actionNames.has(action) || action === "book_meeting") return { ok: false, error: "Choose a stage change that doesn't need extra details." };
    const result: BulkResult = { updated: 0, failed: [] };
    for (const id of parsed.data) {
      const outcome = await transitionLead(id, action);
      if (outcome.ok) result.updated += 1;
      else result.failed.push({ id, fullName: (await getLead(id))?.fullName ?? "Lead", error: outcome.error });
    }
    return { ok: true, data: result };
  } catch (error) {
    return actionError(error);
  }
}

const bulkPatchSchema = z.union([
  z.object({ profileId: objectId }),
  z.object({ addTag: z.string().trim().min(1, "Enter a tag.").max(50) }),
]);

export async function bulkUpdateLeads(ids: string[], patch: z.input<typeof bulkPatchSchema>): Promise<ActionResult<{ updated: number }>> {
  try {
    const userId = await requireUserId();
    const parsedIds = leadIdsSchema.safeParse(ids);
    if (!parsedIds.success) return { ok: false, error: parsedIds.error.issues[0]?.message ?? "Select leads first." };
    const parsed = bulkPatchSchema.safeParse(patch);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the change." };
    await connectDB();
    const filter = { userId, _id: { $in: parsedIds.data.map((id) => new Types.ObjectId(id)) } };
    let update: Record<string, unknown>;
    if ("profileId" in parsed.data) {
      const profileId = new Types.ObjectId(parsed.data.profileId);
      if (!(await Profile.exists({ _id: profileId, userId, isActive: true }))) return { ok: false, error: "Choose an active profile you own." };
      update = { $set: { profileId } };
    } else {
      update = { $addToSet: { tags: parsed.data.addTag } };
    }
    const outcome = await Lead.updateMany(filter, update);
    invalidateLeadViews();
    return { ok: true, data: { updated: outcome.modifiedCount } };
  } catch (error) {
    return actionError(error);
  }
}

export async function deleteLeads(ids: string[]): Promise<ActionResult<{ deleted: number }>> {
  try {
    const userId = await requireUserId();
    const parsed = leadIdsSchema.safeParse(ids);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Select leads first." };
    const db = await connectDB();
    const objectIds = parsed.data.map((id) => new Types.ObjectId(id));
    let deleted = 0;
    await db.connection.transaction(async (session) => {
      // Only ids owned by this user are touched, whatever the client sent.
      const owned = await Lead.find({ userId, _id: { $in: objectIds } }).select("_id").session(session).lean();
      const ownedIds = owned.map((lead) => lead._id);
      deleted = (await Lead.deleteMany({ userId, _id: { $in: ownedIds } }, { session })).deletedCount;
      await Activity.deleteMany({ userId, leadId: { $in: ownedIds }, type: { $ne: "comment" } }, { session });
      await Activity.updateMany({ userId, leadId: { $in: ownedIds }, type: "comment" }, { $unset: { leadId: 1 } }, { session });
      await Comment.updateMany({ userId, leadId: { $in: ownedIds } }, { $unset: { leadId: 1 } }, { session });
    });
    invalidateLeadViews();
    return { ok: true, data: { deleted } };
  } catch (error) {
    return actionError(error);
  }
}

export type DuplicateMatch = { id: string; fullName: string; profileId: string };

/** Existing leads for a batch of normalized URLs, keyed by normalized URL (any profile). */
export async function findDuplicateLeads(normalizedUrls: string[]): Promise<Record<string, DuplicateMatch>> {
  const userId = await requireUserId();
  const urls = [...new Set(normalizedUrls.filter((url) => typeof url === "string"))].slice(0, 200);
  if (!urls.length) return {};
  await connectDB();
  const leads = await Lead.find({ userId, linkedinUrlNormalized: { $in: urls } })
    .select("fullName profileId linkedinUrlNormalized").lean();
  return Object.fromEntries(leads.map((lead) => [
    lead.linkedinUrlNormalized,
    { id: String(lead._id), fullName: lead.fullName, profileId: String(lead.profileId) },
  ]));
}

export async function createLead(input: CreateLeadInput): Promise<ActionResult<LeadDTO>> {
  try {
    const userId = await requireUserId();
    const parsed = leadInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the lead details." };
    const url = parseLinkedInProfileUrl(parsed.data.linkedinUrl);
    if (!url) return { ok: false, error: "Enter a valid LinkedIn profile URL." };
    const db = await connectDB();
    const profileId = new Types.ObjectId(parsed.data.profileId);
    const profile = await Profile.findOne({ _id: profileId, userId, isActive: true }).lean();
    if (!profile) return { ok: false, error: "Choose an active profile you own." };
    const duplicate = await Lead.findOne({ userId, linkedinUrlNormalized: url.normalizedUrl }).lean();
    if (duplicate && !parsed.data.allowDuplicate) {
      const owner = await Profile.findOne({ _id: duplicate.profileId, userId }).select("name").lean();
      return { ok: false, error: `This LinkedIn URL is already saved as ${duplicate.fullName} under ${owner?.name ?? "another profile"}. Open that lead, or tick "Save anyway" to add a duplicate.` };
    }

    const now = new Date();
    const fullName = parsed.data.fullName || url.suggestedName || url.slug;
    let created: LeadRecord | null = null;
    await db.connection.transaction(async (session) => {
      const [lead] = await Lead.create([{
        userId,
        profileId,
        fullName,
        firstName: fullName.split(/\s+/)[0] || url.firstName,
        linkedinUrl: parsed.data.linkedinUrl,
        linkedinUrlNormalized: url.normalizedUrl,
        country: parsed.data.country,
        service: parsed.data.service || undefined,
        role: parsed.data.role || undefined,
        company: parsed.data.company || undefined,
        headline: parsed.data.headline || undefined,
        tags: parsed.data.tags ?? [],
        stage: "request_sent",
        followUpCount: 0,
        requestSentAt: now,
        lastActivityAt: now,
        stageChangedAt: now,
      }], { session });
      await Activity.create([{
        userId, profileId, leadId: lead._id, type: "request_sent", occurredAt: now,
      }], { session });
      created = lead.toObject() as LeadRecord;
    });
    const saved = created as LeadRecord | null;
    if (!saved) throw new Error("Could not save the lead.");
    invalidateLeadViews(String(saved._id));
    return { ok: true, data: toLeadDTO(saved) };
  } catch (error) {
    return actionError(error);
  }
}

export type BulkLeadSkipped = { index: number; url: string; error: string; duplicateId?: string };

export async function createLeadsBulk(input: CreateLeadsBulkInput): Promise<ActionResult<{
  created: LeadDTO[];
  skipped: BulkLeadSkipped[];
}>> {
  try {
    const userId = await requireUserId();
    const parsed = bulkInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the batch details." };
    const db = await connectDB();
    const profileId = new Types.ObjectId(parsed.data.profileId);
    if (!(await Profile.exists({ _id: profileId, userId, isActive: true }))) {
      return { ok: false, error: "Choose an active profile you own." };
    }

    const skipped: BulkLeadSkipped[] = [];
    const candidates = parsed.data.urls.map((url, index) => ({ url: url.trim(), index, parsed: parseLinkedInProfileUrl(url) }));
    for (const row of candidates) {
      if (!row.parsed) skipped.push({ index: row.index, url: row.url, error: "Invalid LinkedIn profile URL." });
    }
    const normalized = candidates.filter((row) => row.parsed).map((row) => row.parsed!.normalizedUrl);
    const existing = await Lead.find({ userId, linkedinUrlNormalized: { $in: normalized } })
      .select("_id linkedinUrlNormalized")
      .lean();
    const existingByUrl = new Map(existing.map((lead) => [lead.linkedinUrlNormalized, String(lead._id)]));
    const seen = new Set<string>();
    const valid = candidates.filter((row) => {
      if (!row.parsed) return false;
      const key = row.parsed.normalizedUrl;
      const prior = existingByUrl.get(key);
      if (!parsed.data.allowDuplicates && (prior || seen.has(key))) {
        skipped.push({ index: row.index, url: row.url, error: "Duplicate LinkedIn profile URL.", duplicateId: prior });
        return false;
      }
      seen.add(key);
      return true;
    });
    if (valid.length === 0) return { ok: true, data: { created: [], skipped: skipped.sort((a, b) => a.index - b.index) } };

    const now = new Date();
    let created: LeadRecord[] = [];
    await db.connection.transaction(async (session) => {
      const documents = valid.map((row) => ({
        userId,
        profileId,
        fullName: row.parsed!.suggestedName || row.parsed!.slug,
        firstName: row.parsed!.firstName || row.parsed!.slug,
        linkedinUrl: row.url,
        linkedinUrlNormalized: row.parsed!.normalizedUrl,
        country: parsed.data.country,
        service: parsed.data.service || undefined,
        tags: [],
        stage: "request_sent" as const,
        followUpCount: 0,
        requestSentAt: now,
        lastActivityAt: now,
        stageChangedAt: now,
      }));
      const inserted = await Lead.insertMany(documents, { session });
      await Activity.insertMany(inserted.map((lead) => ({
        userId, profileId, leadId: lead._id, type: "request_sent", occurredAt: now,
      })), { session });
      created = inserted.map((lead) => lead.toObject() as LeadRecord);
    });
    invalidateLeadViews();
    return { ok: true, data: { created: created.map(toLeadDTO), skipped: skipped.sort((a, b) => a.index - b.index) } };
  } catch (error) {
    return actionError(error);
  }
}

const actionNames = new Set<TransitionActionName>([
  "accept", "send_first_message", "send_follow_up", "receive_reply", "send_reply",
  "book_meeting", "win", "lose", "close_no_response", "withdraw",
]);

function isTransitionAction(value: unknown): value is TransitionAction {
  const type = typeof value === "string" ? value :
    value && typeof value === "object" && "type" in value ? value.type : null;
  return typeof type === "string" && actionNames.has(type as TransitionActionName);
}

function transitionState(lead: LeadRecord): LeadTransitionState {
  return {
    stage: lead.stage,
    followUpCount: lead.followUpCount,
    requestSentAt: lead.requestSentAt,
    acceptedAt: lead.acceptedAt ?? null,
    firstMessageAt: lead.firstMessageAt ?? null,
    lastMessageAt: lead.lastMessageAt ?? null,
    lastReplyAt: lead.lastReplyAt ?? null,
    meetingAt: lead.meetingAt ?? null,
    closedAt: lead.closedAt ?? null,
    nextActionType: lead.nextActionType ?? null,
    nextActionDueAt: lead.nextActionDueAt ?? null,
    lastActivityAt: lead.lastActivityAt ?? null,
    stageChangedAt: lead.stageChangedAt ?? null,
  };
}

export async function transitionLead(
  leadId: string,
  action: TransitionAction,
): Promise<ActionResult<{ lead: LeadDTO; activityId: string; undoUntil: string }>> {
  try {
    const userId = await requireUserId();
    if (!Types.ObjectId.isValid(leadId)) return { ok: false, error: "Lead not found." };
    if (!isTransitionAction(action)) return { ok: false, error: "Choose a valid action." };
    const db = await connectDB();
    const user = await User.findOne({ _id: userId }).select("settings").lean();
    if (!user) return { ok: false, error: "Account not found." };
    const settings = { ...defaultUserSettings, ...user.settings };
    let updated: LeadRecord | null = null;
    let activityId = "";
    const now = new Date();
    await db.connection.transaction(async (session) => {
      const lead = await Lead.findOne({ _id: new Types.ObjectId(leadId), userId }).session(session).lean();
      if (!lead) throw new Error("Lead not found.");
      const before = transitionState(lead as LeadRecord);
      const result = applyTransition(before, action, now, settings);
      const version = lead.__v ?? 0;
      // Documents written outside Mongoose may have no __v yet; $inc creates it.
      const versionFilter = lead.__v === undefined ? { __v: { $exists: false } } : { __v: lead.__v };
      const changed = await Lead.findOneAndUpdate(
        { _id: lead._id, userId, ...versionFilter },
        { $set: result.updates, $inc: { __v: 1 } },
        { returnDocument: "after", session, runValidators: true },
      ).lean();
      if (!changed) throw new Error("This lead changed while you were editing it. Refresh and try again.");
      const [activity] = await Activity.create([{
        userId,
        profileId: lead.profileId,
        leadId: lead._id,
        type: result.activity.type,
        occurredAt: result.activity.occurredAt,
        meta: {
          ...result.activity.meta,
          undoBefore: before,
          undoFields: Object.keys(result.updates),
          undoVersion: version + 1,
        },
      }], { session });
      updated = changed as LeadRecord;
      activityId = String(activity._id);
    });
    if (!updated) throw new Error("Could not update the lead.");
    invalidateLeadViews(leadId);
    return {
      ok: true,
      data: { lead: toLeadDTO(updated), activityId, undoUntil: new Date(now.getTime() + 5000).toISOString() },
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function undoLeadTransition(activityId: string): Promise<ActionResult<LeadDTO>> {
  try {
    const userId = await requireUserId();
    if (!Types.ObjectId.isValid(activityId)) return { ok: false, error: "Undo is no longer available." };
    const db = await connectDB();
    let restored: LeadRecord | null = null;
    await db.connection.transaction(async (session) => {
      const activity = await Activity.findOne({ _id: new Types.ObjectId(activityId), userId }).session(session).lean();
      if (!activity?.leadId || !activity.meta) throw new Error("Undo is no longer available.");
      if (Date.now() - activity.occurredAt.getTime() > 5000) throw new Error("The five-second undo window has passed.");
      const latest = await Activity.findOne({ userId, leadId: activity.leadId })
        .sort({ occurredAt: -1, _id: -1 }).session(session).lean();
      if (!latest || String(latest._id) !== activityId) throw new Error("The lead has a newer activity; undo is no longer available.");
      const before = activity.meta.undoBefore as LeadTransitionState | undefined;
      const fields = activity.meta.undoFields as string[] | undefined;
      const version = activity.meta.undoVersion as number | undefined;
      if (!before || !fields || version === undefined) throw new Error("Undo is no longer available.");
      const current = await Lead.findOne({ _id: activity.leadId, userId, __v: version }).session(session).lean();
      if (!current) throw new Error("The lead has changed; undo is no longer available.");
      const applied: Partial<LeadTransitionState> = {};
      for (const field of fields) (applied as Record<string, unknown>)[field] = (current as unknown as Record<string, unknown>)[field];
      const undoUpdates = createUndoUpdates(before, applied);
      const lead = await Lead.findOneAndUpdate(
        { _id: activity.leadId, userId, __v: version },
        { $set: undoUpdates, $inc: { __v: 1 } },
        { returnDocument: "after", session, runValidators: true },
      ).lean();
      if (!lead) throw new Error("The lead has changed; undo is no longer available.");
      await Activity.deleteOne({ _id: activity._id, userId }, { session });
      restored = lead as LeadRecord;
    });
    const saved = restored as LeadRecord | null;
    if (!saved) throw new Error("Undo is no longer available.");
    invalidateLeadViews(String(saved._id));
    return { ok: true, data: toLeadDTO(saved) };
  } catch (error) {
    return actionError(error);
  }
}

export async function listTodayLeads(profileId?: string): Promise<LeadDTO[]> {
  const userId = await requireUserId();
  await connectDB();
  if (profileId && !Types.ObjectId.isValid(profileId)) return [];
  const user = await User.findOne({ _id: userId }).select("settings").lean();
  const query = todayQueueFilter(userId, user?.settings, new Date(), profileId ? new Types.ObjectId(profileId) : undefined);
  const leads = await Lead.find(query).sort({ nextActionDueAt: 1, requestSentAt: 1 }).lean();
  return leads.map((lead) => toLeadDTO(lead as LeadRecord));
}
