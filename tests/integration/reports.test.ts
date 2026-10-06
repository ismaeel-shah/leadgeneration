import "./harness";
import { describe, expect, it } from "vitest";
import { session } from "./harness";
import { createComment } from "@/actions/comments";
import { createLead, createLeadsBulk, transitionLead } from "@/actions/leads";
import { createProfile, getProfileProgress, updateProfile } from "@/actions/profiles";
import { changePassword, getSettings, updateAccount, updateSettings } from "@/actions/settings";
import Activity, { type ActivityType } from "@/models/Activity";
import User, { defaultUserSettings } from "@/models/User";
import { getReportData } from "@/queries/reports";
import { hash } from "bcryptjs";

async function setup() {
  await User.create({ _id: session.userId, name: "Ali", email: `${session.userId}@example.com`, passwordHash: await hash("correct horse battery", 4), settings: defaultUserSettings });
  const profile = await createProfile({ name: "Ali – Main", weeklyInviteLimit: 5, dailyConnectionTarget: 3 });
  if (!profile.ok) throw new Error(profile.error);
  return profile.data;
}

async function addLeads(profileId: string, slugs: string[], country = "AE") {
  const result = await createLeadsBulk({ profileId, country, urls: slugs.map((slug) => `linkedin.com/in/${slug}`) });
  if (!result.ok) throw new Error(result.error);
  return result.data.created;
}

async function step(id: string, ...actions: Parameters<typeof transitionLead>[1][]) {
  for (const action of actions) {
    const result = await transitionLead(id, action);
    if (!result.ok) throw new Error(result.error);
  }
}

describe("reports", () => {
  it("match counts taken straight from the activities collection", async () => {
    const profile = await setup();
    const [a, b, c] = await addLeads(profile.id, ["lead-a", "lead-b", "lead-c"]);
    await addLeads(profile.id, ["lead-d"], "GB");
    await step(a.id, "accept", "send_first_message", "receive_reply", { type: "book_meeting", meetingAt: new Date(Date.now() + 86_400_000).toISOString() }, "win");
    await step(b.id, "accept", "send_first_message", "send_follow_up", "receive_reply");
    await step(c.id, "accept");

    const report = await getReportData({ preset: "last_7" });
    const raw = async (type: ActivityType) => Activity.countDocuments({ userId: session.userId, type });
    const funnel = Object.fromEntries(report.funnel.map((row) => [row.key, row.count]));
    expect(funnel).toEqual({
      request_sent: await raw("request_sent"),
      accepted: await raw("accepted"),
      first_message: await raw("first_message"),
      replied: await raw("replied"),
      meeting_booked: await raw("meeting_booked"),
      won: await raw("won"),
    });
    expect(funnel).toMatchObject({ request_sent: 4, accepted: 3, first_message: 2, replied: 2, meeting_booked: 1, won: 1 });
    expect(report.funnel[1].conversion).toBe(75);
    expect(report.replyAfter).toEqual({ firstMessage: 1, followUp1: 1, followUp2: 0 });
    expect(report.byCountry.find((row) => row.country === "AE")).toMatchObject({ requests: 3, accepted: 3, replies: 2 });
    expect(report.byProfile[0]).toMatchObject({ id: profile.id, requests: 4, acceptanceRate: 75 });
    expect(report.daily.reduce((sum, day) => sum + day.requests, 0)).toBe(4);
  });

  it("only counts the selected profile", async () => {
    const profile = await setup();
    const other = await createProfile({ name: "Ali – UK" });
    if (!other.ok) throw new Error(other.error);
    await addLeads(profile.id, ["one", "two"]);
    await addLeads(other.data.id, ["three"]);
    const report = await getReportData({ preset: "this_month", profileId: other.data.id });
    expect(report.funnel[0].count).toBe(1);
  });
});

describe("profile progress", () => {
  it("counts today's requests and comments and warns near the weekly limit", async () => {
    const profile = await setup();
    await addLeads(profile.id, ["p1", "p2", "p3", "p4"]);
    const comment = await createComment({ profileId: profile.id, postUrl: "https://www.linkedin.com/posts/someone_activity-123" });
    expect(comment.ok).toBe(true);
    let [progress] = await getProfileProgress();
    expect(progress).toMatchObject({ requestsToday: 4, commentsToday: 1, requestsLast7Days: 4, pendingRequests: 4, weeklyWarning: "amber" });
    await createLead({ profileId: profile.id, linkedinUrl: "linkedin.com/in/p5", country: "AE" });
    [progress] = await getProfileProgress();
    expect(progress.weeklyWarning).toBe("red");
  });

  it("keeps deactivated profiles visible on the profiles page only", async () => {
    const profile = await setup();
    await updateProfile(profile.id, { isActive: false });
    expect(await getProfileProgress()).toEqual([]);
    expect(await getProfileProgress(undefined, { includeInactive: true })).toHaveLength(1);
  });
});

describe("settings and account", () => {
  it("saves rule settings and validates them", async () => {
    await setup();
    expect(await updateSettings({ followUpGapDays: 4, countries: ["AE", "GB"] })).toMatchObject({ ok: true });
    expect(await getSettings()).toMatchObject({ followUpGapDays: 4, countries: ["AE", "GB"], maxFollowUps: 2 });
    expect(await updateSettings({ timezone: "Mars/Olympus" })).toMatchObject({ ok: false });
  });

  it("uses the follow-up gap from settings", async () => {
    const profile = await setup();
    await updateSettings({ followUpGapDays: 5 });
    const [lead] = await addLeads(profile.id, ["gap-test"]);
    await step(lead.id, "accept");
    const sent = await transitionLead(lead.id, "send_first_message");
    if (!sent.ok) throw new Error(sent.error);
    const days = (Date.parse(sent.data.lead.nextActionDueAt!) - Date.parse(sent.data.lead.lastMessageAt!)) / 86_400_000;
    expect(Math.round(days)).toBe(5);
  });

  it("updates the account and changes the password only with the current one", async () => {
    await setup();
    expect(await updateAccount({ name: "Ali Raza", email: "ALI@Example.com" })).toMatchObject({ ok: true, data: { email: "ali@example.com" } });
    expect(await changePassword({ currentPassword: "wrong password", newPassword: "a brand new passphrase" })).toMatchObject({ ok: false });
    expect(await changePassword({ currentPassword: "correct horse battery", newPassword: "short" })).toMatchObject({ ok: false });
    expect(await changePassword({ currentPassword: "correct horse battery", newPassword: "a brand new passphrase" })).toMatchObject({ ok: true });
  });
});
