/** Client-safe constants shared by models, server actions and UI. */

import type { LeadStage, NextActionType } from "./rules";

export const profileColors = [
  "blue", "teal", "violet", "amber", "rose", "green", "indigo", "slate",
] as const;

export type ProfileColor = (typeof profileColors)[number];

export const stageLabels: Record<LeadStage, string> = {
  request_sent: "Request sent",
  accepted: "Accepted",
  messaged: "Messaged",
  follow_up_1: "Follow-up 1 sent",
  follow_up_2: "Follow-up 2 sent",
  replied: "Replied",
  meeting: "Meeting booked",
  won: "Won",
  lost: "Not interested",
  no_response: "No response",
  withdrawn: "Withdrawn",
};

/** Badge tone per stage (see `.badge.<tone>` in globals.css). */
export const stageTones: Record<LeadStage, string> = {
  request_sent: "",
  accepted: "blue",
  messaged: "indigo",
  follow_up_1: "violet",
  follow_up_2: "violet",
  replied: "green",
  meeting: "teal",
  won: "solid-green",
  lost: "grey",
  no_response: "grey",
  withdrawn: "outline",
};

export const openStages: readonly LeadStage[] = [
  "request_sent", "accepted", "messaged", "follow_up_1", "follow_up_2", "replied", "meeting",
];

export const closedStages: readonly LeadStage[] = ["won", "lost", "no_response", "withdrawn"];

/** Columns the pipeline table can sort by on the server. */
export const leadSortKeys = ["fullName", "profileId", "country", "service", "stage", "nextActionDueAt", "lastActivityAt", "createdAt"] as const;
export type LeadSortKey = (typeof leadSortKeys)[number];

export const nextActionLabels: Record<NextActionType, string> = {
  send_first_message: "Send first message",
  follow_up: "Send follow-up",
  reply: "Reply to lead",
  close_or_retry: "Close or try once more",
  check_conversation: "Check for reply",
  meeting: "Meeting",
};
