import { addCalendarDays, DEFAULT_TIMEZONE } from "./dates";

export type LeadStage =
  | "request_sent"
  | "accepted"
  | "messaged"
  | "follow_up_1"
  | "follow_up_2"
  | "replied"
  | "meeting"
  | "won"
  | "lost"
  | "no_response"
  | "withdrawn";

export type NextActionType =
  | "send_first_message"
  | "follow_up"
  | "reply"
  | "close_or_retry"
  | "check_conversation"
  | "meeting";

export type TransitionActionName =
  | "accept"
  | "send_first_message"
  | "send_follow_up"
  | "receive_reply"
  | "send_reply"
  | "book_meeting"
  | "win"
  | "lose"
  | "close_no_response"
  | "withdraw";

export type TransitionAction =
  | TransitionActionName
  | { type: TransitionActionName; meetingAt?: Date | string | null };

export type ActivityType =
  | "accepted"
  | "first_message"
  | "follow_up"
  | "replied"
  | "user_replied"
  | "meeting_booked"
  | "won"
  | "lost"
  | "no_response"
  | "withdrawn";

export type LeadTransitionState = {
  stage: LeadStage;
  followUpCount?: number;
  requestSentAt?: Date | null;
  acceptedAt?: Date | null;
  firstMessageAt?: Date | null;
  lastMessageAt?: Date | null;
  lastReplyAt?: Date | null;
  meetingAt?: Date | null;
  closedAt?: Date | null;
  nextActionType?: NextActionType | null;
  nextActionDueAt?: Date | null;
  /** Time of the latest pipeline event; sorts "Last activity". */
  lastActivityAt?: Date | null;
  /** When the lead entered its current stage; drives "days in stage". */
  stageChangedAt?: Date | null;
};

export type RuleSettings = {
  timezone?: string;
  followUpGapDays?: number;
  maxFollowUps?: number;
};

export type ActivityInput = {
  type: ActivityType;
  occurredAt: Date;
  meta: {
    fromStage: LeadStage;
    toStage: LeadStage;
    followUpNumber?: number;
  };
};

export type TransitionResult = {
  updates: Partial<LeadTransitionState>;
  activity: ActivityInput;
};

export class TransitionError extends Error {
  readonly code = "ILLEGAL_TRANSITION";

  constructor(message: string) {
    super(message);
    this.name = "TransitionError";
  }
}

const CLOSED_STAGES: readonly LeadStage[] = ["won", "lost", "no_response", "withdrawn"];
const FOLLOW_UP_STAGES: readonly LeadStage[] = ["messaged", "follow_up_1", "follow_up_2"];

function assertAllowed(lead: LeadTransitionState, action: TransitionActionName, allowed: readonly LeadStage[]): void {
  if (CLOSED_STAGES.includes(lead.stage)) {
    throw new TransitionError("This lead is closed. No further pipeline actions are available.");
  }
  if (!allowed.includes(lead.stage)) {
    throw new TransitionError(`Cannot ${action.replaceAll("_", " ")} from the ${lead.stage.replaceAll("_", " ")} stage.`);
  }
}

function settingsWithDefaults(settings: RuleSettings): Required<RuleSettings> {
  const resolved = {
    timezone: settings.timezone || DEFAULT_TIMEZONE,
    followUpGapDays: settings.followUpGapDays ?? 3,
    maxFollowUps: settings.maxFollowUps ?? 2,
  };
  if (!Number.isInteger(resolved.followUpGapDays) || resolved.followUpGapDays < 1) {
    throw new RangeError("followUpGapDays must be a positive whole number");
  }
  if (!Number.isInteger(resolved.maxFollowUps) || resolved.maxFollowUps < 1) {
    throw new RangeError("maxFollowUps must be a positive whole number");
  }
  new Intl.DateTimeFormat("en-US", { timeZone: resolved.timezone });
  return resolved;
}

function meetingDate(action: TransitionAction, lead: LeadTransitionState): Date {
  const value = typeof action === "string" ? lead.meetingAt : (action.meetingAt ?? lead.meetingAt);
  const date = value instanceof Date ? value : value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    throw new TransitionError("Choose a valid meeting date and time before booking the meeting.");
  }
  return date;
}

/** Pure transition calculation. Persist updates and activity together in the caller. */
export function applyTransition(
  lead: LeadTransitionState,
  action: TransitionAction,
  now: Date,
  settings: RuleSettings = {},
): TransitionResult {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new RangeError("now must be a valid Date");
  const { timezone, followUpGapDays, maxFollowUps } = settingsWithDefaults(settings);
  const type = typeof action === "string" ? action : action.type;
  const fromStage = lead.stage;
  let updates: Partial<LeadTransitionState>;
  let activityType: ActivityType;
  let followUpNumber: number | undefined;

  switch (type) {
    case "accept":
      assertAllowed(lead, type, ["request_sent"]);
      updates = {
        stage: "accepted",
        acceptedAt: now,
        nextActionType: "send_first_message",
        nextActionDueAt: now,
      };
      activityType = "accepted";
      break;

    case "send_first_message":
      assertAllowed(lead, type, ["accepted"]);
      updates = {
        stage: "messaged",
        firstMessageAt: now,
        lastMessageAt: now,
        nextActionType: "follow_up",
        nextActionDueAt: addCalendarDays(now, followUpGapDays, timezone),
      };
      activityType = "first_message";
      break;

    case "send_follow_up": {
      assertAllowed(lead, type, FOLLOW_UP_STAGES);
      const previousCount = lead.followUpCount ?? 0;
      if (!Number.isInteger(previousCount) || previousCount < 0) {
        throw new TransitionError("This lead has an invalid follow-up count.");
      }
      if (previousCount >= maxFollowUps) {
        throw new TransitionError("The follow-up limit is reached. Close the lead or record a reply.");
      }
      followUpNumber = previousCount + 1;
      updates = {
        stage: followUpNumber === 1 ? "follow_up_1" : "follow_up_2",
        followUpCount: followUpNumber,
        lastMessageAt: now,
        nextActionType: followUpNumber < maxFollowUps ? "follow_up" : "close_or_retry",
        nextActionDueAt: addCalendarDays(now, followUpGapDays, timezone),
      };
      activityType = "follow_up";
      break;
    }

    case "receive_reply":
      assertAllowed(lead, type, ["accepted", "messaged", "follow_up_1", "follow_up_2", "replied"]);
      updates = {
        stage: "replied",
        lastReplyAt: now,
        nextActionType: "reply",
        nextActionDueAt: now,
      };
      activityType = "replied";
      break;

    case "send_reply":
      assertAllowed(lead, type, ["replied"]);
      updates = {
        stage: "replied",
        lastMessageAt: now,
        nextActionType: "check_conversation",
        nextActionDueAt: addCalendarDays(now, 2, timezone),
      };
      activityType = "user_replied";
      break;

    case "book_meeting": {
      assertAllowed(lead, type, ["replied"]);
      const at = meetingDate(action, lead);
      updates = {
        stage: "meeting",
        meetingAt: at,
        nextActionType: "meeting",
        nextActionDueAt: at,
      };
      activityType = "meeting_booked";
      break;
    }

    case "win":
      assertAllowed(lead, type, ["replied", "meeting"]);
      updates = { stage: "won", closedAt: now, nextActionType: null, nextActionDueAt: null };
      activityType = "won";
      break;

    case "lose":
      assertAllowed(lead, type, ["replied", "meeting"]);
      updates = { stage: "lost", closedAt: now, nextActionType: null, nextActionDueAt: null };
      activityType = "lost";
      break;

    case "close_no_response":
      assertAllowed(lead, type, FOLLOW_UP_STAGES);
      if ((lead.followUpCount ?? 0) < maxFollowUps) {
        throw new TransitionError("Send the remaining follow-ups before closing as no response.");
      }
      updates = { stage: "no_response", closedAt: now, nextActionType: null, nextActionDueAt: null };
      activityType = "no_response";
      break;

    case "withdraw":
      assertAllowed(lead, type, ["request_sent"]);
      updates = { stage: "withdrawn", closedAt: now, nextActionType: null, nextActionDueAt: null };
      activityType = "withdrawn";
      break;

    default:
      throw new TransitionError(`Unknown action: ${String(type)}`);
  }

  updates.lastActivityAt = now;
  if (updates.stage && updates.stage !== fromStage) updates.stageChangedAt = now;

  return {
    updates,
    activity: {
      type: activityType,
      occurredAt: now,
      meta: {
        fromStage,
        toStage: updates.stage ?? fromStage,
        ...(followUpNumber === undefined ? {} : { followUpNumber }),
      },
    },
  };
}

const allActions: readonly TransitionActionName[] = [
  "accept", "send_first_message", "send_follow_up", "receive_reply", "send_reply",
  "book_meeting", "win", "lose", "close_no_response", "withdraw",
];

/** Actions that `applyTransition` would accept for this lead right now. */
export function availableActions(lead: LeadTransitionState, settings: RuleSettings = {}): TransitionActionName[] {
  const probeTime = new Date();
  return allActions.filter((action) => {
    try {
      // A meeting date is only required to record the booking, not to offer it.
      applyTransition(lead, action === "book_meeting" ? { type: action, meetingAt: probeTime } : action, probeTime, settings);
      return true;
    } catch {
      return false;
    }
  });
}

/** Restores exactly the fields changed by a transition; the caller removes its activity. */
export function createUndoUpdates(
  previousLead: LeadTransitionState,
  appliedUpdates: Partial<LeadTransitionState>,
): Partial<LeadTransitionState> {
  const undo: Record<string, unknown> = {};
  for (const field of Object.keys(appliedUpdates) as Array<keyof LeadTransitionState>) {
    const previous = previousLead[field];
    undo[field] = previous === undefined ? (field === "followUpCount" ? 0 : null) : previous;
  }
  return undo as Partial<LeadTransitionState>;
}
