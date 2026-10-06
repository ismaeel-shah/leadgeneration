"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CalendarDays, Check, Copy, ExternalLink, MessageCircle, Send, X } from "lucide-react";
import { toast } from "sonner";
import type { LeadDTO } from "@/actions/leads";
import type { ProfileDTO } from "@/actions/profiles";
import type { TemplateDTO } from "@/actions/templates";
import { transitionLead, undoLeadTransition } from "@/actions/leads";
import { countryName } from "@/lib/countries";
import { fillTemplate, matchTemplates, type TemplateType } from "@/lib/templates";
import type { TransitionAction, TransitionActionName } from "@/lib/rules";

export type ActionKind = "reply" | "meeting" | "follow_up" | "first_message" | "close" | "check" | "stale" | "generic";

/** Labels for every pipeline action, used by buttons, the stage menu and toasts. */
export const actionLabels: Record<TransitionActionName, string> = {
  accept: "Mark accepted",
  send_first_message: "First message sent",
  send_follow_up: "Follow-up sent",
  receive_reply: "Mark replied",
  send_reply: "Replied to them",
  book_meeting: "Book meeting…",
  win: "Mark won",
  lose: "Not interested",
  close_no_response: "Close as no response",
  withdraw: "Withdraw request",
};

const doneLabels: Record<TransitionActionName, string> = {
  accept: "Marked accepted",
  send_first_message: "First message marked sent",
  send_follow_up: "Follow-up marked sent",
  receive_reply: "Marked replied",
  send_reply: "Reply logged",
  book_meeting: "Meeting booked",
  win: "Marked won",
  lose: "Marked not interested",
  close_no_response: "Closed as no response",
  withdraw: "Request withdrawn",
};

/**
 * Runs a stage change through the server rules and shows a toast with a
 * five-second Undo. `onOptimistic` / `onRevert` let rows leave a list instantly.
 */
type TransitionCallbacks = { onOptimistic?: () => void; onRevert?: () => void };

export function useLeadTransition(defaults: TransitionCallbacks = {}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function run(leadId: string, action: TransitionAction, callbacks: TransitionCallbacks = {}) {
    const name = typeof action === "string" ? action : action.type;
    const options = { ...defaults, ...callbacks };
    options.onOptimistic?.();
    startTransition(async () => {
      const result = await transitionLead(leadId, action);
      if (!result.ok) {
        options.onRevert?.();
        toast.error(result.error);
        return;
      }
      router.refresh();
      toast.success(doneLabels[name], {
        duration: 5000,
        action: {
          label: "Undo",
          onClick: async () => {
            const undone = await undoLeadTransition(result.data.activityId);
            if (!undone.ok) { toast.error(undone.error); return; }
            options.onRevert?.();
            router.refresh();
            toast.success("Change undone");
          },
        },
      });
    });
  }

  return { run, isPending };
}

export function MeetingDialog({ leadName, onCancel, onConfirm }: { leadName: string; onCancel: () => void; onConfirm: (meetingAt: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Book meeting">
        <div className="modal-header">
          <strong>Book meeting with {leadName}</strong>
          <button type="button" className="button icon-only ghost" aria-label="Close" onClick={onCancel}><X size={17} /></button>
        </div>
        <form className="modal-content form-stack" onSubmit={(event) => { event.preventDefault(); if (value) onConfirm(new Date(value).toISOString()); }}>
          <div className="field">
            <label htmlFor="meeting-at">Meeting date and time</label>
            <input id="meeting-at" type="datetime-local" autoFocus required value={value} onChange={(event) => setValue(event.target.value)} />
          </div>
          <div className="form-actions">
            <button type="button" className="button" onClick={onCancel}>Cancel</button>
            <button type="submit" className="button primary" disabled={!value}>Book meeting</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TemplatePicker({ templates, lead, profile, onPick, onClose }: { templates: TemplateDTO[]; lead: LeadDTO; profile?: ProfileDTO; onPick: (template: TemplateDTO) => void; onClose: () => void }) {
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Choose a template">
        <div className="modal-header">
          <strong>Choose a template</strong>
          <button type="button" className="button icon-only ghost" aria-label="Close" onClick={onClose}><X size={17} /></button>
        </div>
        <div className="modal-content template-picker">
          {templates.map((template) => (
            <button type="button" key={template.id} className="button" onClick={() => onPick(template)}>
              <strong>{template.name}</strong>
              <span className="muted">{fillTemplate(template.body, templateLead(lead), profile?.name ?? "").slice(0, 160)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function templateLead(lead: LeadDTO) {
  return { ...lead, countryName: countryName(lead.country) };
}

export function kindFor(lead: LeadDTO): ActionKind {
  if (lead.stage === "request_sent") return "stale";
  const kinds: Record<string, ActionKind> = {
    reply: "reply", meeting: "meeting", follow_up: "follow_up", send_first_message: "first_message",
    close_or_retry: "close", check_conversation: "check",
  };
  return (lead.nextActionType && kinds[lead.nextActionType]) || "generic";
}

type Props = {
  lead: LeadDTO;
  profile?: ProfileDTO;
  templates?: TemplateDTO[];
  kind?: ActionKind;
  /** Today rows disappear while the change is saved; the detail panel stays put. */
  hideWhilePending?: boolean;
  align?: "start" | "end";
};

export function LeadActions({ lead, profile, templates = [], kind = kindFor(lead), hideWhilePending = true, align = "end" }: Props) {
  const [hidden, setHidden] = useState(false);
  const [meetingOpen, setMeetingOpen] = useState(false);
  const [picker, setPicker] = useState<TemplateDTO[]>([]);
  const { run, isPending } = useLeadTransition(hideWhilePending ? { onOptimistic: () => setHidden(true), onRevert: () => setHidden(false) } : {});

  async function copyTemplate(type: TemplateType) {
    const matches = matchTemplates(templates, type, lead);
    if (!matches.length) { toast.error("No matching template yet. Add one in Templates."); return; }
    if (matches.length > 1) { setPicker(matches); return; }
    await copySelected(matches[0]);
  }
  async function copySelected(template: TemplateDTO) {
    try {
      await navigator.clipboard.writeText(fillTemplate(template.body, templateLead(lead), profile?.name ?? ""));
      toast.success("Message copied");
      setPicker([]);
    } catch {
      toast.error("Could not copy the message. Check clipboard permissions.");
    }
  }

  const buttons: React.ReactNode[] = [];
  const action = (name: TransitionActionName, label = actionLabels[name], icon?: React.ReactNode, primary = false) =>
    buttons.push(
      <button type="button" className={`button small ${primary ? "primary" : ""}`} key={name} disabled={isPending} onClick={() => run(lead.id, name)}>
        {icon}{label}
      </button>,
    );
  const copy = (label: string, type: TemplateType) =>
    buttons.push(<button type="button" className="button small" key={`copy-${type}`} onClick={() => copyTemplate(type)}><Copy size={13} />{label}</button>);
  const openLinkedIn = () =>
    buttons.push(<a className="button small" key="open" href={lead.linkedinUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={13} />Open LinkedIn</a>);
  const bookMeeting = () =>
    buttons.push(<button type="button" className="button small" key="meeting" disabled={isPending} onClick={() => setMeetingOpen(true)}><CalendarDays size={13} />Book meeting</button>);

  switch (kind) {
    case "first_message":
      copy("Copy message", "first_message"); openLinkedIn();
      action("send_first_message", "Mark sent", <Send size={13} />, true); action("receive_reply");
      break;
    case "follow_up":
      copy("Copy follow-up", lead.followUpCount === 0 ? "follow_up_1" : "follow_up_2"); openLinkedIn();
      action("send_follow_up", "Mark sent", <Send size={13} />, true); action("receive_reply");
      break;
    case "reply":
      openLinkedIn(); action("send_reply", undefined, <MessageCircle size={13} />, true); bookMeeting(); action("lose");
      break;
    case "meeting":
      openLinkedIn(); action("win", undefined, <Check size={13} />, true); action("lose");
      break;
    case "close":
      openLinkedIn(); action("close_no_response", undefined, <X size={13} />); action("receive_reply");
      break;
    case "check":
      openLinkedIn(); action("receive_reply", undefined, <MessageCircle size={13} />, true); bookMeeting(); action("lose");
      break;
    case "stale":
      copy("Copy note", "connection_note"); openLinkedIn();
      action("accept", undefined, <Check size={13} />, true); action("withdraw");
      break;
    default:
      openLinkedIn();
  }

  return (
    <>
      {hidden
        ? <span className="muted updating">Updating…</span>
        : <div className={`row-actions ${align === "start" ? "start" : ""}`}>{buttons}</div>}
      {meetingOpen && (
        <MeetingDialog
          leadName={lead.fullName}
          onCancel={() => setMeetingOpen(false)}
          onConfirm={(meetingAt) => { setMeetingOpen(false); run(lead.id, { type: "book_meeting", meetingAt }); }}
        />
      )}
      {picker.length > 0 && <TemplatePicker templates={picker} lead={lead} profile={profile} onPick={copySelected} onClose={() => setPicker([])} />}
    </>
  );
}
