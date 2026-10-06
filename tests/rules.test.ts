import { describe, expect, it } from "vitest";
import {
  applyTransition,
  availableActions,
  createUndoUpdates,
  TransitionError,
  type LeadTransitionState,
} from "../lib/rules";

const now = new Date("2026-10-06T18:30:00.000Z"); // 23:30 in Karachi
const newLead: LeadTransitionState = {
  stage: "request_sent",
  followUpCount: 0,
  requestSentAt: now,
  nextActionType: null,
  nextActionDueAt: null,
};

describe("lead stage transitions", () => {
  it("marks acceptance and first message as due today", () => {
    const result = applyTransition(newLead, "accept", now);
    expect(result.updates).toMatchObject({
      stage: "accepted",
      acceptedAt: now,
      nextActionType: "send_first_message",
      nextActionDueAt: now,
    });
    expect(result.activity).toMatchObject({ type: "accepted", meta: { fromStage: "request_sent", toStage: "accepted" } });
  });

  it("schedules first and second follow-ups by local calendar day", () => {
    const accepted = { ...newLead, ...applyTransition(newLead, "accept", now).updates };
    const first = applyTransition(accepted, "send_first_message", now);
    expect(first.updates).toMatchObject({
      stage: "messaged",
      firstMessageAt: now,
      lastMessageAt: now,
      nextActionType: "follow_up",
    });
    expect(first.updates.nextActionDueAt?.toISOString()).toBe("2026-10-09T18:30:00.000Z");

    const follow1 = applyTransition({ ...accepted, ...first.updates }, "send_follow_up", now);
    expect(follow1.updates).toMatchObject({ stage: "follow_up_1", followUpCount: 1, nextActionType: "follow_up" });
    expect(follow1.activity.meta.followUpNumber).toBe(1);

    const follow2 = applyTransition({ ...accepted, ...first.updates, ...follow1.updates }, "send_follow_up", now);
    expect(follow2.updates).toMatchObject({ stage: "follow_up_2", followUpCount: 2, nextActionType: "close_or_retry" });
    expect(follow2.activity.meta.followUpNumber).toBe(2);
    expect(() => applyTransition({ ...accepted, ...first.updates, ...follow1.updates, ...follow2.updates }, "send_follow_up", now))
      .toThrow(TransitionError);
  });

  it("respects an edited maximum follow-up count", () => {
    const lead: LeadTransitionState = { stage: "follow_up_1", followUpCount: 1 };
    const result = applyTransition(lead, "send_follow_up", now, { maxFollowUps: 3 });
    expect(result.updates).toMatchObject({ stage: "follow_up_2", followUpCount: 2, nextActionType: "follow_up" });
  });

  it("requires all follow-ups before manually closing no response", () => {
    expect(() => applyTransition({ stage: "follow_up_1", followUpCount: 1 }, "close_no_response", now))
      .toThrow("remaining follow-ups");
    const result = applyTransition({ stage: "follow_up_2", followUpCount: 2 }, "close_no_response", now);
    expect(result.updates).toMatchObject({ stage: "no_response", closedAt: now, nextActionType: null, nextActionDueAt: null });
  });

  it("replaces follow-up reminders with reply and conversation reminders", () => {
    const lead: LeadTransitionState = {
      stage: "follow_up_1",
      followUpCount: 1,
      nextActionType: "follow_up",
      nextActionDueAt: new Date("2026-10-09T18:30:00.000Z"),
    };
    const received = applyTransition(lead, "receive_reply", now);
    expect(received.updates).toMatchObject({ stage: "replied", lastReplyAt: now, nextActionType: "reply", nextActionDueAt: now });
    const sent = applyTransition({ ...lead, ...received.updates }, "send_reply", now);
    expect(sent.updates).toMatchObject({ stage: "replied", lastMessageAt: now, nextActionType: "check_conversation" });
    expect(sent.updates.nextActionDueAt?.toISOString()).toBe("2026-10-08T18:30:00.000Z");
    expect(sent.activity.type).toBe("user_replied");
  });

  it("books a meeting at the selected instant and closes won or lost leads", () => {
    const meetingAt = new Date("2026-10-12T10:00:00.000Z");
    const booked = applyTransition({ stage: "replied" }, { type: "book_meeting", meetingAt }, now);
    expect(booked.updates).toMatchObject({ stage: "meeting", meetingAt, nextActionType: "meeting", nextActionDueAt: meetingAt });
    expect(booked.activity.type).toBe("meeting_booked");
    for (const action of ["win", "lose"] as const) {
      const closed = applyTransition({ stage: "meeting", ...booked.updates }, action, now);
      expect(closed.updates).toMatchObject({
        stage: action === "win" ? "won" : "lost",
        closedAt: now,
        nextActionType: null,
        nextActionDueAt: null,
      });
    }
  });

  it("withdraws only pending requests and rejects illegal jumps", () => {
    expect(applyTransition(newLead, "withdraw", now).updates.stage).toBe("withdrawn");
    expect(() => applyTransition(newLead, "send_follow_up", now)).toThrow(TransitionError);
    expect(() => applyTransition({ stage: "accepted" }, "win", now)).toThrow(TransitionError);
    expect(() => applyTransition({ stage: "won" }, "receive_reply", now)).toThrow(TransitionError);
    expect(() => applyTransition({ stage: "replied" }, { type: "book_meeting" }, now)).toThrow("meeting date");
  });

  it("builds undo updates for every changed field", () => {
    const applied = applyTransition(newLead, "accept", now);
    expect(createUndoUpdates(newLead, applied.updates)).toEqual({
      stage: "request_sent",
      acceptedAt: null,
      nextActionType: null,
      nextActionDueAt: null,
      lastActivityAt: null,
      stageChangedAt: null,
    });
    const followUp = applyTransition({ stage: "messaged" }, "send_follow_up", now);
    expect(createUndoUpdates({ stage: "messaged" }, followUp.updates).followUpCount).toBe(0);
  });
});

describe("activity timestamps", () => {
  it("records the stage change time only when the stage changes", () => {
    const later = new Date("2026-10-07T09:00:00.000Z");
    const accepted = applyTransition(newLead, "accept", now).updates;
    expect(accepted).toMatchObject({ lastActivityAt: now, stageChangedAt: now });
    const replied = { ...newLead, stage: "replied" as const, stageChangedAt: now };
    const reply = applyTransition(replied, "send_reply", later).updates;
    expect(reply.lastActivityAt).toBe(later);
    expect(reply).not.toHaveProperty("stageChangedAt");
  });
});

describe("availableActions", () => {
  it("offers accept and withdraw for a pending request", () => {
    expect(availableActions(newLead)).toEqual(["accept", "withdraw"]);
  });

  it("offers closing only after the last follow-up", () => {
    const messaged: LeadTransitionState = { ...newLead, stage: "follow_up_1", followUpCount: 1 };
    expect(availableActions(messaged)).toEqual(["send_follow_up", "receive_reply"]);
    const exhausted: LeadTransitionState = { ...newLead, stage: "follow_up_2", followUpCount: 2 };
    expect(availableActions(exhausted)).toEqual(["receive_reply", "close_no_response"]);
  });

  it("offers booking a meeting from an active conversation", () => {
    const replied: LeadTransitionState = { ...newLead, stage: "replied" };
    expect(availableActions(replied)).toEqual(["receive_reply", "send_reply", "book_meeting", "win", "lose"]);
  });

  it("offers nothing once a lead is closed", () => {
    expect(availableActions({ ...newLead, stage: "won" })).toEqual([]);
  });
});
