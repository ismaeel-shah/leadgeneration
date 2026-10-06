"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import type { LeadActivityDTO, LeadDTO } from "@/actions/leads";
import { deleteLead, updateLead } from "@/actions/leads";
import type { ProfileDTO } from "@/actions/profiles";
import type { TemplateDTO } from "@/actions/templates";
import { LeadActions, MeetingDialog, actionLabels, useLeadTransition } from "@/components/leads/lead-actions";
import { nextActionLabels, stageLabels, stageTones } from "@/lib/constants";
import { countryFlag, countryName, countryOptions } from "@/lib/countries";
import { dueLabel, exactDateTime, initials, relativeTime } from "@/lib/format";
import { availableActions, type TransitionActionName } from "@/lib/rules";
import type { UserSettings } from "@/models/User";

const activityLabels: Record<string, string> = {
  request_sent: "Connection request sent",
  accepted: "Request accepted",
  first_message: "First message sent",
  replied: "Lead replied",
  user_replied: "You replied",
  meeting_booked: "Meeting booked",
  won: "Marked won",
  lost: "Marked not interested",
  no_response: "Closed as no response",
  withdrawn: "Request withdrawn",
  comment: "Commented on their post",
  note: "Note added",
};

function activityLabel(activity: LeadActivityDTO) {
  if (activity.type === "follow_up") return `Follow-up ${activity.meta?.followUpNumber ?? ""} sent`.replace("  ", " ");
  return activityLabels[activity.type] ?? activity.type.replaceAll("_", " ");
}

type Props = {
  lead: LeadDTO;
  activities: LeadActivityDTO[];
  profiles: ProfileDTO[];
  templates: TemplateDTO[];
  settings: UserSettings;
  variant: "page" | "panel";
};

type Fields = {
  fullName: string; headline: string; role: string; company: string; country: string; service: string;
  tags: string[]; email: string; phone: string; dealValue: string;
};

function fieldsFrom(lead: LeadDTO): Fields {
  return {
    fullName: lead.fullName, headline: lead.headline ?? "", role: lead.role ?? "", company: lead.company ?? "",
    country: lead.country, service: lead.service ?? "", tags: lead.tags, email: lead.email ?? "",
    phone: lead.phone ?? "", dealValue: lead.dealValue === undefined ? "" : String(lead.dealValue),
  };
}

export function LeadDetail({ lead, activities, profiles, templates, settings, variant }: Props) {
  const router = useRouter();
  const profile = profiles.find((item) => item.id === lead.profileId);
  const timezone = settings.timezone;
  const [fields, setFields] = useState<Fields>(() => fieldsFrom(lead));
  const [fieldError, setFieldError] = useState("");
  const [savingFields, startSaving] = useTransition();
  const [meetingOpen, setMeetingOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, startDeleting] = useTransition();
  const { run, isPending } = useLeadTransition();
  const actions = availableActions({ stage: lead.stage, followUpCount: lead.followUpCount }, settings);
  const due = dueLabel(lead.nextActionDueAt, timezone);
  const serverFields = JSON.stringify(fieldsFrom(lead));
  const dirty = JSON.stringify(fields) !== serverFields;

  // Reset only when the saved details change, so a notes autosave doesn't wipe unsaved edits.
  const [syncedFields, setSyncedFields] = useState(serverFields);
  if (syncedFields !== serverFields) {
    setSyncedFields(serverFields);
    setFields(JSON.parse(serverFields) as Fields);
  }

  function close() {
    if (variant === "panel") router.back();
    else router.push("/leads");
  }

  function chooseAction(name: TransitionActionName) {
    if (name === "book_meeting") setMeetingOpen(true);
    else run(lead.id, name);
  }

  function saveFields() {
    setFieldError("");
    const dealValue = fields.dealValue.trim() === "" ? null : Number(fields.dealValue);
    if (dealValue !== null && Number.isNaN(dealValue)) { setFieldError("Deal value must be a number."); return; }
    startSaving(async () => {
      const result = await updateLead(lead.id, { ...fields, dealValue });
      if (!result.ok) { setFieldError(result.error); return; }
      toast.success("Lead updated");
      router.refresh();
    });
  }

  function moveProfile(profileId: string) {
    startSaving(async () => {
      const result = await updateLead(lead.id, { profileId });
      if (!result.ok) { toast.error(result.error); return; }
      toast.success(`Moved to ${profiles.find((item) => item.id === profileId)?.name ?? "profile"}`);
      router.refresh();
    });
  }

  function remove() {
    startDeleting(async () => {
      const result = await deleteLead(lead.id);
      if (!result.ok) { toast.error(result.error); return; }
      toast.success(`${lead.fullName} deleted`);
      setConfirmDelete(false);
      if (variant === "panel") { router.back(); router.refresh(); } else router.push("/leads");
    });
  }

  const set = <K extends keyof Fields>(key: K) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setFields((current) => ({ ...current, [key]: event.target.value }));

  return (
    <div className={`lead-detail ${variant}`}>
      <header className="lead-detail-header">
        {variant === "page" && <Link href="/leads" className="back-link"><ArrowLeft size={14} /> Pipeline</Link>}
        <div className="lead-detail-title">
          <span className="lead-avatar large">{initials(lead.fullName)}</span>
          <div className="lead-detail-name">
            <h1>{lead.fullName}</h1>
            <p>{lead.headline || [lead.role, lead.company].filter(Boolean).join(" · ") || lead.linkedinUrlNormalized}</p>
            <div className="lead-meta">
              <span>{countryFlag(lead.country)} {countryName(lead.country)}</span>
              {profile && <span className="profile-badge"><i className={`profile-dot color-${profile.color}`} />{profile.name}</span>}
              <span className={`badge ${stageTones[lead.stage]}`}>{stageLabels[lead.stage]}</span>
            </div>
          </div>
          {variant === "panel" && <button type="button" className="button icon-only ghost" aria-label="Close" onClick={close}><X size={19} /></button>}
        </div>
        <div className="lead-detail-toolbar">
          <a className="button" href={lead.linkedinUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> Open LinkedIn</a>
          <select
            className="input"
            aria-label="Change stage"
            value=""
            disabled={!actions.length || isPending}
            onChange={(event) => { if (event.target.value) chooseAction(event.target.value as TransitionActionName); }}
          >
            <option value="">{actions.length ? "Change stage…" : "Lead is closed"}</option>
            {actions.map((name) => <option key={name} value={name}>{actionLabels[name]}</option>)}
          </select>
        </div>
      </header>

      <section className={`card next-action-card ${due.overdue ? "overdue" : ""}`} aria-label="Next action">
        {lead.nextActionType ? (
          <>
            <div>
              <span className="eyebrow">Next action</span>
              <strong>{nextActionLabels[lead.nextActionType]}</strong>
              {lead.nextActionDueAt && (
                <span className={`due-label ${due.overdue ? "overdue" : ""}`} title={exactDateTime(lead.nextActionDueAt, timezone)}>
                  {lead.nextActionType === "meeting" ? exactDateTime(lead.nextActionDueAt, timezone) : due.text}
                </span>
              )}
            </div>
            <LeadActions lead={lead} profile={profile} templates={templates} hideWhilePending={false} align="start" />
          </>
        ) : lead.stage === "request_sent" ? (
          <>
            <div><span className="eyebrow">Next action</span><strong>Waiting for them to accept</strong><span className="muted">Sent {relativeTime(lead.requestSentAt)}</span></div>
            <LeadActions lead={lead} profile={profile} templates={templates} kind="stale" hideWhilePending={false} align="start" />
          </>
        ) : (
          <div><span className="eyebrow">Next action</span><strong>None — this lead is closed</strong></div>
        )}
      </section>

      <section className="lead-detail-section" aria-label="Details">
        <h2>Details</h2>
        <div className="form-stack">
          <div className="field-grid">
            <div className="field"><label htmlFor="lead-fullName">Name</label><input id="lead-fullName" value={fields.fullName} onChange={set("fullName")} /></div>
            <div className="field"><label htmlFor="lead-headline">Headline</label><input id="lead-headline" value={fields.headline} onChange={set("headline")} placeholder="Optional" /></div>
            <div className="field"><label htmlFor="lead-role">Role</label><input id="lead-role" value={fields.role} onChange={set("role")} placeholder="Optional" /></div>
            <div className="field"><label htmlFor="lead-company">Company</label><input id="lead-company" value={fields.company} onChange={set("company")} placeholder="Optional" /></div>
            <div className="field">
              <label htmlFor="lead-country">Country</label>
              <select id="lead-country" value={fields.country} onChange={set("country")}>
                {countryOptions(settings.countries).map((option) => <option key={option.code} value={option.code}>{option.flag} {option.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="lead-service">Service or campaign</label>
              <input id="lead-service" list="lead-service-options" value={fields.service} onChange={set("service")} placeholder="Optional" />
              <datalist id="lead-service-options">{settings.services.map((service) => <option key={service} value={service} />)}</datalist>
            </div>
            <div className="field"><label htmlFor="lead-email">Email</label><input id="lead-email" type="email" value={fields.email} onChange={set("email")} placeholder="If shared in chat" /></div>
            <div className="field"><label htmlFor="lead-phone">Phone</label><input id="lead-phone" type="tel" value={fields.phone} onChange={set("phone")} placeholder="If shared in chat" /></div>
            <div className="field"><label htmlFor="lead-deal">Deal value</label><input id="lead-deal" type="number" min={0} inputMode="decimal" value={fields.dealValue} onChange={set("dealValue")} placeholder="Optional" /></div>
            <div className="field">
              <label htmlFor="lead-profile">Profile</label>
              <select id="lead-profile" value={lead.profileId} disabled={savingFields} onChange={(event) => moveProfile(event.target.value)}>
                {profiles.filter((item) => item.isActive || item.id === lead.profileId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              <small>Changing this moves the lead to another profile.</small>
            </div>
          </div>
          <TagEditor tags={fields.tags} suggestions={settings.tags} onChange={(tags) => setFields((current) => ({ ...current, tags }))} />
          {fieldError && <div className="form-error" role="alert">{fieldError}</div>}
          <div className="form-actions">
            {dirty && <button type="button" className="button" onClick={() => setFields(fieldsFrom(lead))}>Discard</button>}
            <button type="button" className="button primary" disabled={!dirty || savingFields} onClick={saveFields}>{savingFields ? "Saving…" : "Save details"}</button>
          </div>
        </div>
      </section>

      <NotesEditor leadId={lead.id} initial={lead.notes ?? ""} />

      <section className="lead-detail-section" aria-label="Timeline">
        <h2>Timeline</h2>
        {activities.length ? (
          <ol className="timeline">
            {activities.map((activity) => {
              const from = profiles.find((item) => item.id === activity.profileId);
              return (
                <li key={activity.id}>
                  <span className={`timeline-dot ${activity.type}`} />
                  <div>
                    <strong>{activityLabel(activity)}</strong>
                    <span className="muted"> · <time dateTime={activity.occurredAt} title={exactDateTime(activity.occurredAt, timezone)}>{exactDateTime(activity.occurredAt, timezone)}</time>{from ? ` from ${from.name}` : ""}</span>
                  </div>
                </li>
              );
            })}
          </ol>
        ) : <p className="muted">No activity yet.</p>}
      </section>

      <section className="lead-detail-section danger-zone">
        <button type="button" className="button ghost danger" onClick={() => setConfirmDelete(true)}><Trash2 size={14} /> Delete lead</button>
      </section>

      {meetingOpen && (
        <MeetingDialog
          leadName={lead.fullName}
          onCancel={() => setMeetingOpen(false)}
          onConfirm={(meetingAt) => { setMeetingOpen(false); run(lead.id, { type: "book_meeting", meetingAt }); }}
        />
      )}
      {confirmDelete && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmDelete(false); }}>
          <div className="modal" role="alertdialog" aria-modal="true" aria-label="Delete lead">
            <div className="modal-header"><strong>Delete {lead.fullName}?</strong></div>
            <div className="modal-content form-stack">
              <p className="muted" style={{ margin: 0 }}>This removes the lead and its timeline, and the activity is no longer counted in reports. Logged comments are kept but unlinked. This can&apos;t be undone.</p>
              <div className="form-actions">
                <button type="button" className="button" autoFocus onClick={() => setConfirmDelete(false)}>Cancel</button>
                <button type="button" className="button danger-solid" disabled={deleting} onClick={remove}>{deleting ? "Deleting…" : "Delete lead"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TagEditor({ tags, suggestions, onChange }: { tags: string[]; suggestions: string[]; onChange: (tags: string[]) => void }) {
  const [draft, setDraft] = useState("");
  function add(value: string) {
    const tag = value.trim();
    if (tag && !tags.includes(tag)) onChange([...tags, tag]);
    setDraft("");
  }
  return (
    <div className="field">
      <label htmlFor="lead-tag-input">Tags</label>
      <div className="tag-editor">
        {tags.map((tag) => (
          <span key={tag} className="tag-chip">{tag}<button type="button" aria-label={`Remove tag ${tag}`} onClick={() => onChange(tags.filter((item) => item !== tag))}><X size={12} /></button></span>
        ))}
        <input
          id="lead-tag-input"
          list="lead-tag-options"
          value={draft}
          placeholder={tags.length ? "" : "Add a tag"}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") { event.preventDefault(); add(draft); }
            if (event.key === "Backspace" && !draft && tags.length) onChange(tags.slice(0, -1));
          }}
          onBlur={() => draft && add(draft)}
        />
        <datalist id="lead-tag-options">{suggestions.filter((tag) => !tags.includes(tag)).map((tag) => <option key={tag} value={tag} />)}</datalist>
      </div>
    </div>
  );
}

/** Notes save themselves shortly after typing stops. */
function NotesEditor({ leadId, initial }: { leadId: string; initial: string }) {
  const [value, setValue] = useState(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const saved = useRef(initial);

  useEffect(() => {
    if (value === saved.current) return;
    setStatus("saving");
    const timer = setTimeout(async () => {
      const result = await updateLead(leadId, { notes: value });
      if (result.ok) { saved.current = value; setStatus("saved"); }
      else setStatus("error");
    }, 800);
    return () => clearTimeout(timer);
  }, [leadId, value]);

  return (
    <section className="lead-detail-section" aria-label="Notes">
      <div className="section-row">
        <h2><label htmlFor="lead-notes">Notes</label></h2>
        <span className={`save-status ${status}`} aria-live="polite">
          {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : status === "error" ? "Couldn't save — keep typing to retry" : ""}
        </span>
      </div>
      <textarea id="lead-notes" className="notes" value={value} onChange={(event) => setValue(event.target.value)} placeholder="Context from your conversation, what they need, next steps…" />
    </section>
  );
}
