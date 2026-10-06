import { Types } from "mongoose";
import { requireUserId } from "@/lib/auth";
import { countryName } from "@/lib/countries";
import { connectDB } from "@/lib/db";
import { addCalendarDays, calendarDayKey, startOfDay, DEFAULT_TIMEZONE } from "@/lib/dates";
import Activity from "@/models/Activity";
import Lead from "@/models/Lead";
import Profile from "@/models/Profile";
import User from "@/models/User";

export type ReportPreset = "this_week" | "last_7" | "this_month" | "last_30" | "custom";
export type ReportFilters = { preset?: string; profileId?: string; from?: string; to?: string };
export type MetricRow = {
  label: string;
  requests: number;
  accepted: number;
  firstMessages: number;
  replies: number;
  meetings: number;
  acceptanceRate: number | null;
  replyRate: number | null;
};
export type ReportData = {
  preset: ReportPreset;
  profileId: string;
  from: string;
  to: string;
  timezone: string;
  notice?: string;
  funnel: Array<{ key: string; label: string; count: number; conversion: number | null }>;
  daily: Array<{ day: string; requests: number; accepted: number; replies: number }>;
  byProfile: Array<MetricRow & { id: string; color: string }>;
  byCountry: Array<MetricRow & { country: string }>;
  replyAfter: { firstMessage: number; followUp1: number; followUp2: number };
};

type GroupCount = { _id: string; count: number };
type DailyCount = { _id: { day: string; type: string }; count: number };
type MetricCount = {
  _id: Types.ObjectId | string;
  requests: number;
  accepted: number;
  firstMessages: number;
  replies: number;
  meetings: number;
};
type Facets = {
  totals: GroupCount[];
  daily: DailyCount[];
  byProfile: MetricCount[];
  byCountry: MetricCount[];
  replyAfter: GroupCount[];
};

const funnelSteps = [
  ["request_sent", "Requests"],
  ["accepted", "Accepted"],
  ["first_message", "Messaged"],
  ["replied", "Replied"],
  ["meeting_booked", "Meetings"],
  ["won", "Won"],
] as const;

function validDateKey(value?: string): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function daysFromToday(day: string, today: string): number {
  return Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

function rate(numerator: number, denominator: number): number | null {
  return denominator ? Math.round((numerator / denominator) * 100) : null;
}

function metrics(row: MetricCount, label: string): MetricRow {
  return {
    label,
    requests: row.requests,
    accepted: row.accepted,
    firstMessages: row.firstMessages,
    replies: row.replies,
    meetings: row.meetings,
    acceptanceRate: rate(row.accepted, row.requests),
    replyRate: rate(row.replies, row.firstMessages),
  };
}

function zeroMetrics(id: Types.ObjectId | string): MetricCount {
  return { _id: id, requests: 0, accepted: 0, firstMessages: 0, replies: 0, meetings: 0 };
}

function localWeekday(day: string): number {
  // UTC date arithmetic is safe here because this is already a local day key.
  return new Date(`${day}T00:00:00Z`).getUTCDay();
}

export async function getReportData(filters: ReportFilters = {}): Promise<ReportData> {
  const userId = await requireUserId();
  await connectDB();
  const [user, profiles] = await Promise.all([
    User.findOne({ _id: userId }).select("settings.timezone").lean(),
    Profile.find({ userId }).select("name color").lean(),
  ]);
  const timezone = user?.settings?.timezone || DEFAULT_TIMEZONE;
  const todayStart = startOfDay(new Date(), timezone);
  const today = calendarDayKey(todayStart, timezone);
  const requestedPreset = filters.preset || "last_30";
  let preset: ReportPreset = ["this_week", "last_7", "this_month", "last_30", "custom"].includes(requestedPreset)
    ? requestedPreset as ReportPreset
    : "last_30";
  let fromDay: string;
  let toDay = today;
  let notice: string | undefined;
  if (preset === "custom") {
    if (validDateKey(filters.from) && validDateKey(filters.to) && filters.from <= filters.to && daysFromToday(filters.to, filters.from) <= 365) {
      fromDay = filters.from;
      toDay = filters.to;
    } else {
      preset = "last_30";
      notice = "Choose a valid custom range of up to 366 days. Showing the last 30 days.";
      fromDay = calendarDayKey(addCalendarDays(todayStart, -29, timezone), timezone);
    }
  } else {
    const offset = preset === "this_week" ? -((localWeekday(today) + 6) % 7)
      : preset === "last_7" ? -6
      : preset === "this_month" ? -(Number(today.slice(8, 10)) - 1)
      : -29;
    fromDay = calendarDayKey(addCalendarDays(todayStart, offset, timezone), timezone);
  }
  const from = addCalendarDays(todayStart, daysFromToday(fromDay, today), timezone);
  const toExclusive = addCalendarDays(todayStart, daysFromToday(toDay, today) + 1, timezone);
  const profileId = filters.profileId || "";
  const profileObjectId = Types.ObjectId.isValid(profileId) ? new Types.ObjectId(profileId) : undefined;
  const match: Record<string, unknown> = {
    userId,
    occurredAt: { $gte: from, $lt: toExclusive },
    leadId: { $type: "objectId" },
    type: { $in: funnelSteps.map(([key]) => key) },
  };
  if (profileId) match.profileId = profileObjectId ?? null;
  const sumType = (type: string) => ({ $sum: { $cond: [{ $eq: ["$type", type] }, 1, 0] } });
  const groupMetrics = {
    requests: sumType("request_sent"),
    accepted: sumType("accepted"),
    firstMessages: sumType("first_message"),
    replies: sumType("replied"),
    meetings: sumType("meeting_booked"),
  };

  const [result] = await Activity.aggregate<Facets>([
    { $match: match },
    { $sort: { occurredAt: 1, _id: 1 } },
    { $group: {
      _id: { leadId: "$leadId", type: "$type" },
      leadId: { $first: "$leadId" },
      profileId: { $first: "$profileId" },
      type: { $first: "$type" },
      occurredAt: { $first: "$occurredAt" },
      meta: { $first: "$meta" },
    } },
    { $facet: {
      totals: [{ $group: { _id: "$type", count: { $sum: 1 } } }],
      daily: [{ $group: {
        _id: {
          day: { $dateToString: { format: "%Y-%m-%d", date: "$occurredAt", timezone } },
          type: "$type",
        },
        count: { $sum: 1 },
      } }],
      byProfile: [{ $group: { _id: "$profileId", ...groupMetrics } }],
      byCountry: [
        { $lookup: {
          from: Lead.collection.name,
          let: { leadId: "$leadId" },
          pipeline: [
            { $match: { $expr: { $and: [{ $eq: ["$_id", "$$leadId"] }, { $eq: ["$userId", userId] }] } } },
            { $project: { country: 1 } },
          ],
          as: "lead",
        } },
        { $unwind: "$lead" },
        { $group: { _id: "$lead.country", ...groupMetrics } },
      ],
      replyAfter: [
        { $match: { type: "replied", "meta.fromStage": { $in: ["messaged", "follow_up_1", "follow_up_2"] } } },
        { $group: { _id: "$meta.fromStage", count: { $sum: 1 } } },
      ],
    } },
  ]);
  const facets = result ?? { totals: [], daily: [], byProfile: [], byCountry: [], replyAfter: [] };
  const totals = new Map(facets.totals.map((row) => [row._id, row.count]));
  const funnel = funnelSteps.map(([key, label], index) => ({
    key,
    label,
    count: totals.get(key) ?? 0,
    conversion: index ? rate(totals.get(key) ?? 0, totals.get(funnelSteps[index - 1][0]) ?? 0) : null,
  }));
  const dailyMap = new Map<string, { day: string; requests: number; accepted: number; replies: number }>();
  for (let day = from; day < toExclusive; day = addCalendarDays(day, 1, timezone)) {
    const key = calendarDayKey(day, timezone);
    dailyMap.set(key, { day: key, requests: 0, accepted: 0, replies: 0 });
  }
  for (const item of facets.daily) {
    const row = dailyMap.get(item._id.day);
    if (!row) continue;
    if (item._id.type === "request_sent") row.requests = item.count;
    if (item._id.type === "accepted") row.accepted = item.count;
    if (item._id.type === "replied") row.replies = item.count;
  }
  const profileCounts = new Map(facets.byProfile.map((row) => [String(row._id), row]));
  const byProfile = profiles
    .filter((profile) => !profileId || String(profile._id) === profileId)
    .map((profile) => ({
      id: String(profile._id),
      color: profile.color,
      ...metrics(profileCounts.get(String(profile._id)) ?? zeroMetrics(profile._id), profile.name),
    }))
    .sort((a, b) => b.requests - a.requests || a.label.localeCompare(b.label));
  const byCountry = facets.byCountry.map((row) => {
    const country = String(row._id || "");
    return { country, ...metrics(row, countryName(country)) };
  }).sort((a, b) => (b.replyRate ?? -1) - (a.replyRate ?? -1) || b.requests - a.requests);
  const replyAfterCounts = new Map(facets.replyAfter.map((row) => [row._id, row.count]));

  return {
    preset,
    profileId,
    from: fromDay,
    to: toDay,
    timezone,
    notice,
    funnel,
    daily: [...dailyMap.values()],
    byProfile,
    byCountry,
    replyAfter: {
      firstMessage: replyAfterCounts.get("messaged") ?? 0,
      followUp1: replyAfterCounts.get("follow_up_1") ?? 0,
      followUp2: replyAfterCounts.get("follow_up_2") ?? 0,
    },
  };
}
