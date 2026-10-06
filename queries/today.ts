import { Types } from "mongoose";
import { addCalendarDays, endOfDay } from "@/lib/dates";
import Lead from "@/models/Lead";
import { defaultUserSettings, type UserSettings } from "@/models/User";

/**
 * Open leads whose next action is due by the end of the user's today, plus
 * requests pending longer than the stale threshold. Closed leads have no
 * next action, so they never match.
 */
export function todayQueueFilter(
  userId: Types.ObjectId,
  settings: Partial<UserSettings> | undefined,
  now: Date,
  profileId?: Types.ObjectId,
): Record<string, unknown> {
  const resolved = { ...defaultUserSettings, ...settings };
  const todayEnd = endOfDay(now, resolved.timezone);
  const staleBefore = addCalendarDays(now, -resolved.staleRequestDays, resolved.timezone);
  return {
    userId,
    ...(profileId ? { profileId } : {}),
    $or: [
      { nextActionDueAt: { $lte: todayEnd } },
      { stage: "request_sent", requestSentAt: { $lt: staleBefore } },
    ],
  };
}

export async function countTodayQueue(
  userId: Types.ObjectId,
  settings: Partial<UserSettings> | undefined,
  now = new Date(),
): Promise<number> {
  return Lead.countDocuments(todayQueueFilter(userId, settings, now));
}
