import "./harness";
import { describe, expect, it } from "vitest";
import { Types } from "mongoose";
import { asUser, session } from "./harness";
import {
  bulkUpdateLeads, createLead, createLeadsBulk, deleteLead, deleteLeads, getLead,
  listLeadActivities, listLeads, listTodayLeads, transitionLead, undoLeadTransition, updateLead,
} from "@/actions/leads";
import { createProfile } from "@/actions/profiles";
import Activity from "@/models/Activity";
import Lead from "@/models/Lead";
import User, { defaultUserSettings } from "@/models/User";

async function setup() {
  await User.create({ _id: session.userId, name: "Ali", email: `${session.userId}@example.com`, passwordHash: "x", settings: defaultUserSettings });
  const profile = await createProfile({ name: "Ali – Main" });
  if (!profile.ok) throw new Error(profile.error);
  return profile.data;
}

async function addLead(profileId: string, slug = "ahmed-khan-12ab") {
  const lead = await createLead({ profileId, linkedinUrl: `https://www.linkedin.com/in/${slug}/`, country: "AE" });
  if (!lead.ok) throw new Error(lead.error);
  return lead.data;
}

describe("creating leads", () => {
  it("starts at request_sent, names the lead from the URL and logs the activity", async () => {
    const profile = await setup();
    const lead = await addLead(profile.id);
    expect(lead).toMatchObject({ stage: "request_sent", fullName: "Ahmed Khan", linkedinUrlNormalized: "linkedin.com/in/ahmed-khan-12ab" });
    const activities = await listLeadActivities(lead.id);
    expect(activities.map((activity) => activity.type)).toEqual(["request_sent"]);
  });

  it("blocks a duplicate URL in any form unless saved deliberately", async () => {
    const profile = await setup();
    await addLead(profile.id);
    const again = await createLead({ profileId: profile.id, linkedinUrl: "linkedin.com/in/Ahmed-Khan-12ab?trk=x", country: "AE" });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error).toContain("under Ali – Main");
    const forced = await createLead({ profileId: profile.id, linkedinUrl: "linkedin.com/in/ahmed-khan-12ab", country: "AE", allowDuplicate: true });
    expect(forced.ok).toBe(true);
  });

  it("bulk-adds valid URLs and reports invalid and duplicate lines", async () => {
    const profile = await setup();
    await addLead(profile.id, "existing-person");
    const result = await createLeadsBulk({
      profileId: profile.id,
      country: "GB",
      urls: ["linkedin.com/in/sara-lee", "https://example.com/in/nope", "linkedin.com/in/existing-person", "www.linkedin.com/in/sara-lee/"],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.created.map((lead) => lead.fullName)).toEqual(["Sara Lee"]);
    expect(result.data.skipped.map((row) => row.index)).toEqual([1, 2, 3]);
  });
});

describe("stage changes", () => {
  it("applies the rules, logs activities and undoes the last change", async () => {
    const profile = await setup();
    const lead = await addLead(profile.id);
    expect((await transitionLead(lead.id, "accept")).ok).toBe(true);
    const messaged = await transitionLead(lead.id, "send_first_message");
    if (!messaged.ok) throw new Error(messaged.error);
    expect(messaged.data.lead).toMatchObject({ stage: "messaged", nextActionType: "follow_up" });

    expect((await undoLeadTransition(messaged.data.activityId)).ok).toBe(true);
    const restored = await getLead(lead.id);
    expect(restored).toMatchObject({ stage: "accepted", nextActionType: "send_first_message" });
    expect(restored?.firstMessageAt).toBeUndefined();
    const types = (await listLeadActivities(lead.id)).map((activity) => activity.type);
    expect(types).toEqual(["accepted", "request_sent"]);
  });

  it("handles leads written without a version field (imports, older data)", async () => {
    const profile = await setup();
    const lead = await addLead(profile.id);
    await Lead.collection.updateOne({ _id: new Types.ObjectId(lead.id) }, { $unset: { __v: 1 } });
    const accepted = await transitionLead(lead.id, "accept");
    if (!accepted.ok) throw new Error(accepted.error);
    expect((await undoLeadTransition(accepted.data.activityId)).ok).toBe(true);
    expect(await getLead(lead.id)).toMatchObject({ stage: "request_sent" });
  });

  it("rejects illegal jumps", async () => {
    const profile = await setup();
    const lead = await addLead(profile.id);
    expect(await transitionLead(lead.id, "send_follow_up")).toMatchObject({ ok: false });
  });

  it("refuses undo once the five-second window has passed", async () => {
    const profile = await setup();
    const lead = await addLead(profile.id);
    const accepted = await transitionLead(lead.id, "accept");
    if (!accepted.ok) throw new Error(accepted.error);
    await Activity.updateOne({ _id: accepted.data.activityId }, { $set: { occurredAt: new Date(Date.now() - 6000) } });
    expect(await undoLeadTransition(accepted.data.activityId)).toMatchObject({ ok: false });
  });
});

describe("ownership", () => {
  it("never lets another user read or change a lead by guessing its id", async () => {
    const profile = await setup();
    const lead = await addLead(profile.id);
    const intruder = new Types.ObjectId();
    await asUser(intruder, async () => {
      await User.create({ _id: intruder, name: "Eve", email: "eve@example.com", passwordHash: "x", settings: defaultUserSettings });
      expect(await getLead(lead.id)).toBeNull();
      expect(await listLeadActivities(lead.id)).toEqual([]);
      expect((await listLeads()).total).toBe(0);
      expect(await updateLead(lead.id, { notes: "hacked" })).toMatchObject({ ok: false });
      expect(await transitionLead(lead.id, "accept")).toMatchObject({ ok: false });
      expect(await deleteLead(lead.id)).toMatchObject({ ok: false });
      expect(await deleteLeads([lead.id])).toMatchObject({ ok: true, data: { deleted: 0 } });
      expect(await bulkUpdateLeads([lead.id], { addTag: "x" })).toMatchObject({ ok: true, data: { updated: 0 } });
      // Someone else's profile can't be used for a new lead either.
      expect(await createLead({ profileId: profile.id, linkedinUrl: "linkedin.com/in/new-one", country: "US" })).toMatchObject({ ok: false });
    });
    const untouched = await getLead(lead.id);
    expect(untouched).toMatchObject({ stage: "request_sent", tags: [] });
    expect(untouched?.notes).toBeUndefined();
  });
});

describe("Today queue", () => {
  it("includes overdue and due-today actions and stale requests, not future ones", async () => {
    const profile = await setup();
    const day = 86_400_000;
    const now = Date.now();
    const make = async (slug: string, patch: Record<string, unknown>) => {
      const lead = await addLead(profile.id, slug);
      await Lead.updateOne({ _id: lead.id }, { $set: patch });
      return lead.id;
    };
    const overdue = await make("overdue", { stage: "messaged", nextActionType: "follow_up", nextActionDueAt: new Date(now - 2 * day) });
    const dueNow = await make("due-now", { stage: "accepted", nextActionType: "send_first_message", nextActionDueAt: new Date(now) });
    await make("future", { stage: "messaged", nextActionType: "follow_up", nextActionDueAt: new Date(now + 3 * day) });
    await make("fresh-request", {});
    const stale = await make("stale-request", { requestSentAt: new Date(now - 30 * day) });
    await make("closed", { stage: "won", nextActionType: null, nextActionDueAt: null });

    const queue = await listTodayLeads();
    expect(queue.map((lead) => lead.id).sort()).toEqual([overdue, dueNow, stale].sort());
    const withDue = queue.filter((lead) => lead.nextActionDueAt);
    expect(withDue[0].id).toBe(overdue);
  });

  it("filters the queue to one profile", async () => {
    const profile = await setup();
    const other = await createProfile({ name: "Ali – UK" });
    if (!other.ok) throw new Error(other.error);
    const lead = await addLead(profile.id, "main-lead");
    await transitionLead(lead.id, "accept");
    const otherLead = await addLead(other.data.id, "uk-lead");
    await transitionLead(otherLead.id, "accept");
    expect((await listTodayLeads(other.data.id)).map((item) => item.id)).toEqual([otherLead.id]);
  });
});

describe("pipeline list", () => {
  it("filters, sorts and counts on the server", async () => {
    const profile = await setup();
    for (const slug of ["zara-ali", "adam-smith", "maria-garcia"]) await addLead(profile.id, slug);
    const tagged = await addLead(profile.id, "tagged-person");
    await updateLead(tagged.id, { tags: ["Hot"] });
    const page = await listLeads({ sort: "fullName", dir: "asc", limit: 2 });
    expect(page.total).toBe(4);
    expect(page.leads.map((lead) => lead.fullName)).toEqual(["Adam Smith", "Maria Garcia"]);
    expect((await listLeads({ tag: "Hot" })).leads.map((lead) => lead.id)).toEqual([tagged.id]);
    expect((await listLeads({ search: "garc" })).total).toBe(1);
  });
});
