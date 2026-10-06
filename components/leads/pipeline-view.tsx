"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DndContext, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, ChevronDown, Columns3, ExternalLink, GripVertical, List, Plus, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import type { LeadDTO, LeadPage, LeadSortKey } from "@/actions/leads";
import { bulkTransitionLeads, bulkUpdateLeads, deleteLeads } from "@/actions/leads";
import type { ProfileDTO } from "@/actions/profiles";
import { MeetingDialog, actionLabels, useLeadTransition } from "@/components/leads/lead-actions";
import { closedStages, nextActionLabels, openStages, stageLabels, stageTones } from "@/lib/constants";
import { countryFlag, countryName } from "@/lib/countries";
import { daysAgo, dueLabel, exactDateTime, relativeTime, shortDate } from "@/lib/format";
import { availableActions, type LeadStage, type TransitionActionName } from "@/lib/rules";
import type { UserSettings } from "@/models/User";

const boardLabels: Partial<Record<LeadStage, string>> = { follow_up_1: "Follow-up 1", follow_up_2: "Follow-up 2", meeting: "Meeting" };
const bulkStageActions: TransitionActionName[] = ["accept", "send_first_message", "send_follow_up", "receive_reply", "win", "lose", "close_no_response", "withdraw"];

type Options = { countries: string[]; services: string[]; tags: string[] };
type Props = {
  result: LeadPage;
  profiles: ProfileDTO[];
  options: Options;
  settings: UserSettings;
  view: "board" | "table";
  params: Record<string, string | undefined>;
};

function addLead() {
  window.dispatchEvent(new CustomEvent("leadflow:add"));
}

export function PipelineView({ result, profiles, options, settings, view, params }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(params.q ?? "");
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const filterKeys = ["q", "country", "service", "stage", "tag", "from", "to", "overdue"];
  const hasFilters = filterKeys.some((key) => params[key]);

  function setParams(changes: Record<string, string>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value); else next.delete(key);
    }
    if (!("page" in changes)) next.delete("page");
    router.push(`${pathname}${next.size ? `?${next}` : ""}`);
  }

  function onSearch(value: string) {
    setSearch(value);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setParams({ q: value.trim() }), 300);
  }

  function clearFilters() {
    setSearch("");
    setParams(Object.fromEntries(filterKeys.map((key) => [key, ""])));
  }

  const select = (key: string, label: string, values: { value: string; label: string }[]) => (
    <select className="input" aria-label={label} value={params[key] ?? ""} onChange={(event) => setParams({ [key]: event.target.value })}>
      <option value="">{label}</option>
      {values.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  );

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Pipeline</h1>
          <p className="page-description">Every connection, conversation and opportunity in one place.</p>
        </div>
        <button type="button" className="button primary" onClick={addLead}><Plus size={15} /> Add lead</button>
      </div>

      <div className="pipeline-toolbar">
        <div className="pipeline-search">
          <Search size={16} className="muted" />
          <input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search name, company or URL" aria-label="Search leads" />
          {search && <button type="button" onClick={() => onSearch("")} aria-label="Clear search"><X size={14} /></button>}
        </div>
        <div className="view-toggle">
          <button type="button" className={view === "table" ? "active" : ""} aria-pressed={view === "table"} onClick={() => setParams({ view: "" })}><List size={16} /> Table</button>
          <button type="button" className={view === "board" ? "active" : ""} aria-pressed={view === "board"} onClick={() => setParams({ view: "board" })}><Columns3 size={16} /> Board</button>
        </div>
      </div>
      <div className="pipeline-filters">
        {select("country", "All countries", options.countries.map((code) => ({ value: code, label: `${countryFlag(code)} ${countryName(code)}` })))}
        {select("service", "All services", options.services.map((service) => ({ value: service, label: service })))}
        {select("stage", "All stages", [...openStages, ...closedStages].map((stage) => ({ value: stage, label: stageLabels[stage] })))}
        {options.tags.length > 0 && select("tag", "All tags", options.tags.map((tag) => ({ value: tag, label: tag })))}
        <label className="date-filter">Added from <input type="date" className="input" value={params.from ?? ""} max={params.to} onChange={(event) => setParams({ from: event.target.value })} /></label>
        <label className="date-filter">to <input type="date" className="input" value={params.to ?? ""} min={params.from} onChange={(event) => setParams({ to: event.target.value })} /></label>
        <label className="overdue-filter"><input type="checkbox" checked={params.overdue === "1"} onChange={(event) => setParams({ overdue: event.target.checked ? "1" : "" })} /> Has overdue action</label>
        {hasFilters && <button type="button" className="button small ghost" onClick={clearFilters}><X size={13} /> Clear filters</button>}
      </div>

      {view === "board"
        ? <BoardView leads={result.leads} total={result.total} profileById={profileById} settings={settings} />
        : <TableView key={`${result.page}:${result.leads.map((lead) => lead.id).join()}`} result={result} profiles={profiles} profileById={profileById} settings={settings} params={params} setParams={setParams} hasFilters={hasFilters} />}
    </>
  );
}

/* ---------- Table ---------- */

const columns: { key: LeadSortKey; label: string }[] = [
  { key: "fullName", label: "Name" },
  { key: "profileId", label: "Profile" },
  { key: "country", label: "Country" },
  { key: "service", label: "Service" },
  { key: "stage", label: "Stage" },
  { key: "nextActionDueAt", label: "Next action" },
  { key: "lastActivityAt", label: "Last activity" },
  { key: "createdAt", label: "Added" },
];

function TableView({ result, profiles, profileById, settings, params, setParams, hasFilters }: {
  result: LeadPage;
  profiles: ProfileDTO[];
  profileById: Map<string, ProfileDTO>;
  settings: UserSettings;
  params: Record<string, string | undefined>;
  setParams: (changes: Record<string, string>) => void;
  hasFilters: boolean;
}) {
  const { leads, total, page, limit } = result;
  const timezone = settings.timezone;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const sortKey = (params.sort as LeadSortKey | undefined) ?? "lastActivityAt";
  const sortDir = params.dir === "asc" ? "asc" : "desc";
  const allSelected = leads.length > 0 && leads.every((lead) => selected.has(lead.id));
  const first = total ? (page - 1) * limit + 1 : 0;
  const last = Math.min(total, page * limit);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function sortBy(key: LeadSortKey) {
    const dir = sortKey === key ? (sortDir === "asc" ? "desc" : "asc") : key === "fullName" || key === "nextActionDueAt" ? "asc" : "desc";
    setParams({ sort: key, dir });
  }

  return (
    <>
      {selected.size > 0 && <BulkBar ids={[...selected]} profiles={profiles} onDone={() => setSelected(new Set())} />}
      <div className="card table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th className="select-cell">
                <input type="checkbox" aria-label="Select all leads on this page" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(leads.map((lead) => lead.id)))} />
              </th>
              {columns.map(({ key, label }) => (
                <th key={key} aria-sort={sortKey === key ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>
                  <button type="button" className="table-sort" onClick={() => sortBy(key)}>
                    {label}{sortKey === key && (sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => {
              const profile = profileById.get(lead.profileId);
              const due = dueLabel(lead.nextActionDueAt, timezone);
              return (
                <tr key={lead.id} className={selected.has(lead.id) ? "selected" : ""}>
                  <td className="select-cell"><input type="checkbox" aria-label={`Select ${lead.fullName}`} checked={selected.has(lead.id)} onChange={() => toggle(lead.id)} /></td>
                  <td>
                    <Link href={`/leads/${lead.id}`} className="strong" data-nav-row>{lead.fullName}</Link>
                    <div className="sub">{[lead.role, lead.company].filter(Boolean).join(" · ") || lead.linkedinUrlNormalized}</div>
                  </td>
                  <td>{profile ? <span className="profile-badge"><i className={`profile-dot color-${profile.color}`} />{profile.name}</span> : "—"}</td>
                  <td title={countryName(lead.country)}>{countryFlag(lead.country)} {lead.country}</td>
                  <td>{lead.service || "—"}</td>
                  <td><span className={`badge ${stageTones[lead.stage]}`}>{stageLabels[lead.stage]}</span></td>
                  <td>
                    {lead.nextActionType ? (
                      <>
                        <span className="strong">{nextActionLabels[lead.nextActionType]}</span>
                        <div className={`sub ${due.overdue ? "overdue-text" : ""}`}>{due.text}</div>
                      </>
                    ) : "—"}
                  </td>
                  <td className="tabular" title={exactDateTime(lead.lastActivityAt, timezone)}>{relativeTime(lead.lastActivityAt)}</td>
                  <td className="tabular" title={lead.createdAt ? exactDateTime(lead.createdAt, timezone) : undefined}>{shortDate(lead.createdAt, timezone)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!leads.length && (
          <div className="empty-state">
            <h3>{hasFilters ? "No leads match these filters" : "No leads yet"}</h3>
            <p>{hasFilters ? "Try removing a filter or searching for something else." : "Log the connection requests you sent today to start your pipeline."}</p>
            {!hasFilters && <button type="button" className="button primary" onClick={addLead}><Plus size={15} /> Add leads</button>}
          </div>
        )}
      </div>
      <div className="pagination">
        <span className="muted tabular">{total ? `${first}–${last} of ${total} leads` : "0 leads"}</span>
        <div>
          <button type="button" className="button small" disabled={page <= 1} onClick={() => setParams({ page: String(page - 1) })}>Previous</button>
          <button type="button" className="button small" disabled={last >= total} onClick={() => setParams({ page: String(page + 1) })}>Next</button>
        </div>
      </div>
    </>
  );
}

function BulkBar({ ids, profiles, onDone }: { ids: string[]; profiles: ProfileDTO[]; onDone: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [tag, setTag] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const count = `${ids.length} lead${ids.length === 1 ? "" : "s"}`;

  function finish(message: string) {
    toast.success(message);
    onDone();
    router.refresh();
  }

  function changeStage(action: TransitionActionName) {
    startTransition(async () => {
      const result = await bulkTransitionLeads(ids, action);
      if (!result.ok) { toast.error(result.error); return; }
      const { updated, failed } = result.data;
      if (failed.length) {
        toast.warning(`${updated} updated. ${failed.length} skipped: ${failed.slice(0, 3).map((item) => item.fullName).join(", ")}${failed.length > 3 ? "…" : ""} — ${failed[0].error}`, { duration: 8000 });
        onDone(); router.refresh();
      } else finish(`${updated} lead${updated === 1 ? "" : "s"} updated`);
    });
  }

  function moveProfile(profileId: string) {
    startTransition(async () => {
      const result = await bulkUpdateLeads(ids, { profileId });
      if (!result.ok) toast.error(result.error); else finish(`${count} moved to ${profiles.find((profile) => profile.id === profileId)?.name}`);
    });
  }

  function addTag() {
    if (!tag.trim()) return;
    startTransition(async () => {
      const result = await bulkUpdateLeads(ids, { addTag: tag.trim() });
      if (!result.ok) toast.error(result.error); else { setTag(""); finish(`Tag “${tag.trim()}” added to ${count}`); }
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteLeads(ids);
      setConfirmDelete(false);
      if (!result.ok) toast.error(result.error); else finish(`${result.data.deleted} lead${result.data.deleted === 1 ? "" : "s"} deleted`);
    });
  }

  return (
    <div className="bulk-bar" role="region" aria-label="Bulk actions">
      <strong>{count} selected</strong>
      <select className="input" aria-label="Change stage" value="" disabled={isPending} onChange={(event) => event.target.value && changeStage(event.target.value as TransitionActionName)}>
        <option value="">Change stage…</option>
        {bulkStageActions.map((action) => <option key={action} value={action}>{actionLabels[action]}</option>)}
      </select>
      <select className="input" aria-label="Move to profile" value="" disabled={isPending} onChange={(event) => event.target.value && moveProfile(event.target.value)}>
        <option value="">Move to profile…</option>
        {profiles.filter((profile) => profile.isActive).map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
      </select>
      <form className="bulk-tag" onSubmit={(event) => { event.preventDefault(); addTag(); }}>
        <input className="input" value={tag} onChange={(event) => setTag(event.target.value)} placeholder="Add tag" aria-label="Tag to add" />
        <button type="submit" className="button small" disabled={isPending || !tag.trim()}>Add</button>
      </form>
      <button type="button" className="button small ghost danger" disabled={isPending} onClick={() => setConfirmDelete(true)}><Trash2 size={13} /> Delete</button>
      <button type="button" className="button small ghost" onClick={onDone}>Clear</button>
      {confirmDelete && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmDelete(false); }}>
          <div className="modal" role="alertdialog" aria-modal="true" aria-label="Delete leads">
            <div className="modal-header"><strong>Delete {count}?</strong></div>
            <div className="modal-content form-stack">
              <p className="muted" style={{ margin: 0 }}>Their timelines are removed too and they stop counting in reports. This can&apos;t be undone.</p>
              <div className="form-actions">
                <button type="button" className="button" autoFocus onClick={() => setConfirmDelete(false)}>Cancel</button>
                <button type="button" className="button danger-solid" disabled={isPending} onClick={remove}>{isPending ? "Deleting…" : `Delete ${count}`}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Board ---------- */

/** The action a drop onto `target` means, or why it isn't allowed. */
function dropAction(lead: LeadDTO, target: LeadStage, settings: UserSettings): { action: TransitionActionName } | { error: string } {
  const wanted: Partial<Record<LeadStage, TransitionActionName>> = {
    accepted: "accept",
    messaged: "send_first_message",
    follow_up_1: "send_follow_up",
    follow_up_2: "send_follow_up",
    replied: "receive_reply",
    meeting: "book_meeting",
  };
  const allowed = availableActions({ stage: lead.stage, followUpCount: lead.followUpCount }, settings);
  const action = wanted[target];
  const followUpMatches = target === "follow_up_1" ? lead.followUpCount === 0 : target === "follow_up_2" ? lead.followUpCount >= 1 : true;
  if (action && allowed.includes(action) && followUpMatches) return { action };
  const next = allowed.filter((name) => name !== "book_meeting" || lead.stage === "replied").map((name) => actionLabels[name].replace("…", "").toLowerCase());
  return {
    error: `${lead.fullName} can't jump from ${stageLabels[lead.stage]} to ${boardLabels[target] ?? stageLabels[target]}.` +
      (next.length ? ` Next step: ${next.join(" or ")}.` : ""),
  };
}

function BoardView({ leads, total, profileById, settings }: { leads: LeadDTO[]; total: number; profileById: Map<string, ProfileDTO>; settings: UserSettings }) {
  const [moved, setMoved] = useState<Record<string, LeadStage>>({});
  // Fresh server data replaces optimistic moves.
  const signature = leads.map((lead) => `${lead.id}:${lead.stage}`).join();
  const [syncedSignature, setSyncedSignature] = useState(signature);
  if (syncedSignature !== signature) { setSyncedSignature(signature); setMoved({}); }
  const [meetingFor, setMeetingFor] = useState<LeadDTO | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));
  const { run } = useLeadTransition();
  const stageOf = (lead: LeadDTO) => moved[lead.id] ?? lead.stage;
  const closed = leads.filter((lead) => closedStages.includes(stageOf(lead)));

  function move(lead: LeadDTO, target: LeadStage, action: Parameters<typeof run>[1]) {
    run(lead.id, action, {
      onOptimistic: () => setMoved((current) => ({ ...current, [lead.id]: target })),
      onRevert: () => setMoved((current) => { const next = { ...current }; delete next[lead.id]; return next; }),
    });
  }

  function onDragEnd(event: DragEndEvent) {
    const lead = event.active.data.current?.lead as LeadDTO | undefined;
    const target = event.over?.id as LeadStage | undefined;
    if (!lead || !target || target === stageOf(lead)) return;
    const outcome = dropAction(lead, target, settings);
    if ("error" in outcome) { toast.error(outcome.error); return; }
    if (outcome.action === "book_meeting") { setMeetingFor(lead); return; }
    move(lead, target, outcome.action);
  }

  return (
    <>
      {total > leads.length && <p className="muted board-note">Showing the {leads.length} most recently active of {total} leads. Use filters to narrow the board.</p>}
      <div className="board-scroll">
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <div className="board-grid">
            {openStages.map((stage) => (
              <BoardColumn key={stage} stage={stage} leads={leads.filter((lead) => stageOf(lead) === stage)} profileById={profileById} timezone={settings.timezone} />
            ))}
          </div>
        </DndContext>
      </div>
      <button type="button" className="button ghost closed-toggle" aria-expanded={showClosed} onClick={() => setShowClosed((value) => !value)}>
        <ChevronDown size={15} className={showClosed ? "rotated" : ""} /> Closed ({closed.length})
      </button>
      {showClosed && (
        <div className="card table-wrap">
          <table className="data-table">
            <tbody>
              {closed.map((lead) => (
                <tr key={lead.id}>
                  <td><Link className="strong" href={`/leads/${lead.id}`}>{lead.fullName}</Link><div className="sub">{lead.company || lead.role || ""}</div></td>
                  <td>{countryFlag(lead.country)} {lead.country}</td>
                  <td><span className={`badge ${stageTones[stageOf(lead)]}`}>{stageLabels[stageOf(lead)]}</span></td>
                  <td className="tabular muted">{lead.closedAt ? shortDate(lead.closedAt, settings.timezone) : ""}</td>
                </tr>
              ))}
              {!closed.length && <tr><td className="muted">No closed leads in this view.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {meetingFor && (
        <MeetingDialog
          leadName={meetingFor.fullName}
          onCancel={() => setMeetingFor(null)}
          onConfirm={(meetingAt) => { const lead = meetingFor; setMeetingFor(null); move(lead, "meeting", { type: "book_meeting", meetingAt }); }}
        />
      )}
    </>
  );
}

function BoardColumn({ stage, leads, profileById, timezone }: { stage: LeadStage; leads: LeadDTO[]; profileById: Map<string, ProfileDTO>; timezone: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <section className={`board-column ${isOver ? "board-column-over" : ""}`} ref={setNodeRef} aria-label={stageLabels[stage]}>
      <div className="board-column-title">
        <span className={`badge ${stageTones[stage]}`}>{boardLabels[stage] ?? stageLabels[stage]}</span>
        <span className="section-count tabular">{leads.length}</span>
      </div>
      <div className="board-column-body">
        {leads.map((lead) => <BoardCard key={lead.id} lead={lead} profile={profileById.get(lead.profileId)} timezone={timezone} />)}
        {!leads.length && <div className="board-empty">Drop a lead here</div>}
      </div>
    </section>
  );
}

function BoardCard({ lead, profile, timezone }: { lead: LeadDTO; profile?: ProfileDTO; timezone: string }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: lead.id, data: { lead } });
  const days = daysAgo(lead.stageChangedAt, timezone);
  return (
    <div ref={setNodeRef} className={`board-card ${isDragging ? "dragging" : ""}`} style={{ transform: CSS.Translate.toString(transform) }}>
      <div className="board-card-top">
        <button type="button" className="drag-handle" aria-label={`Move ${lead.fullName} to another stage`} {...listeners} {...attributes}><GripVertical size={14} /></button>
        <Link href={`/leads/${lead.id}`} className="board-card-name">{lead.fullName}</Link>
        <a href={lead.linkedinUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open ${lead.fullName} on LinkedIn`} className="muted"><ExternalLink size={13} /></a>
      </div>
      <div className="board-card-sub">{lead.company || lead.role || "No company added"}</div>
      <div className="board-card-foot">
        <span title={countryName(lead.country)}>{countryFlag(lead.country)} {lead.country}</span>
        {profile && <span className="profile-badge"><i className={`profile-dot color-${profile.color}`} />{profile.name}</span>}
        <span className="tabular days-in-stage" title={`In this stage since ${exactDateTime(lead.stageChangedAt, timezone)}`}>{days === 0 ? "Today" : `${days}d`}</span>
      </div>
    </div>
  );
}
