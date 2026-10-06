"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, CalendarDays, CheckCheck, Clock3, Hourglass, MailCheck, MessageCircle, Plus, Send } from "lucide-react";
import type { LeadDTO } from "@/actions/leads";
import type { ProfileDTO, ProfileProgressDTO } from "@/actions/profiles";
import type { TemplateDTO } from "@/actions/templates";
import { LeadActions, kindFor, type ActionKind } from "@/components/leads/lead-actions";
import { stageLabels, stageTones } from "@/lib/constants";
import { countryFlag, countryName } from "@/lib/countries";
import { dueLabel, exactDateTime, initials, relativeTime } from "@/lib/format";

type SectionKind = Exclude<ActionKind, "generic">;

const sections: { kind: SectionKind; title: string; description: string; icon: typeof MessageCircle }[] = [
  { kind: "reply", title: "Reply now", description: "Conversations waiting on you", icon: MessageCircle },
  { kind: "meeting", title: "Meetings today", description: "Calls and meetings on your calendar", icon: CalendarDays },
  { kind: "follow_up", title: "Follow-ups due", description: "Overdue first, then due today", icon: Send },
  { kind: "first_message", title: "Send first message", description: "New connections ready for a hello", icon: MailCheck },
  { kind: "close", title: "Close or retry", description: "Final follow-up got no reply", icon: AlertTriangle },
  { kind: "check", title: "Check on conversations", description: "See if they replied to you", icon: Clock3 },
  { kind: "stale", title: "Stale requests", description: "Pending a long time — consider withdrawing", icon: Hourglass },
];

function greeting(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function ProgressCard({ item }: { item: ProfileProgressDTO }) {
  const requestPct = item.dailyConnectionTarget ? Math.min(100, (item.requestsToday / item.dailyConnectionTarget) * 100) : 0;
  const commentPct = item.dailyCommentTarget ? Math.min(100, (item.commentsToday / item.dailyCommentTarget) * 100) : 0;
  const weeklyText = item.weeklyWarning === "red" ? "Weekly limit reached" : item.weeklyWarning === "amber" ? "Near weekly limit" : "This week";
  return (
    <div className="progress-card">
      <div className="progress-title">
        <span className={`profile-dot color-${item.color}`} />
        <span>{item.name}</span>
        <span className={`weekly-status ${item.weeklyWarning}`} title={`${item.requestsLast7Days} of ${item.weeklyInviteLimit} invitations in the last 7 days`}>
          {item.weeklyWarning !== "none" && <AlertTriangle size={12} />} {weeklyText} <strong className="tabular">{item.requestsLast7Days}/{item.weeklyInviteLimit}</strong>
        </span>
      </div>
      <div className="progress-meters">
        <div>
          <div className="progress-label"><span>Requests today</span><strong className="tabular">{item.requestsToday}/{item.dailyConnectionTarget}</strong></div>
          <div className={`meter ${requestPct >= 100 ? "done" : ""}`}><span style={{ width: `${requestPct}%` }} /></div>
        </div>
        <div>
          <div className="progress-label"><span>Comments today</span><strong className="tabular">{item.commentsToday}/{item.dailyCommentTarget}</strong></div>
          <div className={`meter ${commentPct >= 100 ? "done" : ""}`}><span style={{ width: `${commentPct}%` }} /></div>
        </div>
      </div>
    </div>
  );
}

function ActionRow({ lead, kind, profile, templates, timezone }: { lead: LeadDTO; kind: SectionKind; profile?: ProfileDTO; templates: TemplateDTO[]; timezone: string }) {
  const lastEvent = lead.lastActivityAt;
  const due = kind === "stale" ? { text: `Sent ${relativeTime(lead.requestSentAt)}`, overdue: false } : dueLabel(lead.nextActionDueAt, timezone);
  const meetingTime = kind === "meeting" && lead.meetingAt
    ? new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit" }).format(new Date(lead.meetingAt))
    : null;
  return (
    <div className="action-row">
      <Link className="lead-summary" href={`/leads/${lead.id}`} data-nav-row>
        <span className="lead-avatar">{initials(lead.fullName)}</span>
        <span className="lead-summary-main">
          <span className="lead-primary">
            <strong>{lead.fullName}</strong>
            <span className="lead-role">{[lead.role, lead.company].filter(Boolean).join(" · ")}</span>
          </span>
          <span className="lead-meta">
            <span title={countryName(lead.country)}>{countryFlag(lead.country)} {lead.country}</span>
            {profile && <span className="profile-badge"><i className={`profile-dot color-${profile.color}`} />{profile.name}</span>}
            <span className={`badge ${stageTones[lead.stage]}`}>{stageLabels[lead.stage]}</span>
            <span title={exactDateTime(lastEvent, timezone)}>{relativeTime(lastEvent)}</span>
          </span>
        </span>
      </Link>
      <div className="action-row-right">
        <span className={`due-label ${due.overdue ? "overdue" : ""}`}>{meetingTime ? `At ${meetingTime}` : due.text}</span>
        <LeadActions lead={lead} profile={profile} templates={templates} kind={kind} />
      </div>
    </div>
  );
}

type Props = {
  leads: LeadDTO[];
  profiles: ProfileDTO[];
  progress: ProfileProgressDTO[];
  templates: TemplateDTO[];
  timezone: string;
  today: string;
  localHour: number;
  firstName: string;
  filtered: boolean;
};

export function TodayView({ leads, profiles, progress, templates, timezone, today, localHour, firstName, filtered }: Props) {
  const activeProgress = progress.filter((item) => item.isActive);
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const groups = Object.fromEntries(sections.map((section) => [section.kind, [] as LeadDTO[]])) as Record<SectionKind, LeadDTO[]>;
  for (const lead of leads) {
    const kind = kindFor(lead);
    if (kind !== "generic") groups[kind].push(lead);
  }
  const total = leads.length;
  const hasProfiles = profiles.some((profile) => profile.isActive);

  return (
    <>
      <div className="page-header">
        <div>
          <div className="eyebrow">{today}</div>
          <h1 className="page-title">{greeting(localHour)}{firstName ? `, ${firstName}` : ""}</h1>
          <p className="page-description">
            {total ? `${total} action${total === 1 ? "" : "s"} for today${filtered ? " on this profile" : ""}, most urgent first.` : "Nothing due right now."}
          </p>
        </div>
        <button type="button" className="button" onClick={() => window.dispatchEvent(new CustomEvent("leadflow:add", { detail: "bulk" }))}><Plus size={15} /> Bulk add</button>
      </div>

      {hasProfiles ? (
        <div className="progress-grid">{activeProgress.map((item) => <ProgressCard key={item.id} item={item} />)}</div>
      ) : (
        <div className="card empty-state">
          <div className="empty-state-icon"><Plus size={22} /></div>
          <h3>Set up your first profile</h3>
          <p>Add a LinkedIn profile to start logging leads and tracking daily progress.</p>
          <Link className="button primary" href="/profiles">Add profile <ArrowRight size={15} /></Link>
        </div>
      )}

      {total === 0 && hasProfiles && (
        <div className="card empty-state" style={{ marginTop: 28 }}>
          <div className="empty-state-icon"><CheckCheck size={24} /></div>
          <h3>You&apos;re all caught up</h3>
          <p>Send today&apos;s connection requests to keep the pipeline full.</p>
          <button type="button" className="button primary" onClick={() => window.dispatchEvent(new CustomEvent("leadflow:add"))}><Plus size={15} /> Add leads</button>
        </div>
      )}

      {sections.map((section) => {
        const items = groups[section.kind];
        if (!items.length) return null;
        const Icon = section.icon;
        return (
          <section key={section.kind} aria-labelledby={`section-${section.kind}`}>
            <div className="section-heading">
              <span className={`section-icon ${section.kind}`}><Icon size={16} /></span>
              <h2 className="section-title" id={`section-${section.kind}`}>{section.title}</h2>
              <span className="section-count tabular">{items.length}</span>
              <span className="section-subtitle">{section.description}</span>
            </div>
            <div className="card action-list">
              {items.map((lead) => <ActionRow key={lead.id} lead={lead} kind={section.kind} profile={profileById.get(lead.profileId)} templates={templates} timezone={timezone} />)}
            </div>
          </section>
        );
      })}
    </>
  );
}
