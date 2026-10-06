"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { ExternalLink, Link2, MessageCircle, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  createComment, deleteComment, listComments, searchCommentLeads,
  type CommentDTO, type CommentInput, type CommentLeadOption, type CommentPage,
} from "@/actions/comments";
import type { ProfileDTO } from "@/actions/profiles";
import { calendarDayKey } from "@/lib/dates";
import styles from "./comments.module.css";

function localNow(timezone: string) {
  return formatInTimeZone(new Date(), timezone, "yyyy-MM-dd'T'HH:mm");
}

function dayLabel(day: string, today: string): string {
  if (day === today) return "Today";
  return new Intl.DateTimeFormat("en", { dateStyle: "full", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));
}

export function CommentsManager({ initial, profiles, selectedProfileId, autoOpen }: {
  initial: CommentPage;
  profiles: ProfileDTO[];
  selectedProfileId: string;
  /** `?log=1` from the C shortcut or the command palette opens the form. */
  autoOpen: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [items, setItems] = useState(initial.items);
  const [nextCursor, setNextCursor] = useState(initial.nextCursor);
  const [progress, setProgress] = useState(initial.progress);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState<CommentDTO | null>(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState<CommentInput>({ profileId: selectedProfileId || profiles.find((profile) => profile.isActive)?.id || "", postUrl: "", postAuthorName: "", note: "" });
  const [when, setWhen] = useState(() => localNow(initial.timezone));
  const [leadQuery, setLeadQuery] = useState("");
  const [leadOptions, setLeadOptions] = useState<CommentLeadOption[]>([]);
  const [selectedLead, setSelectedLead] = useState<CommentLeadOption | null>(null);
  const today = calendarDayKey(new Date(), initial.timezone);
  const grouped = useMemo(() => {
    const groups = new Map<string, CommentDTO[]>();
    for (const item of items) groups.set(item.dayKey, [...(groups.get(item.dayKey) ?? []), item]);
    return [...groups.entries()];
  }, [items]);

  const searchingLeads = open && !selectedLead && leadQuery.trim().length >= 2;
  const visibleLeadOptions = searchingLeads ? leadOptions : [];
  useEffect(() => {
    if (!searchingLeads) return;
    const timer = setTimeout(async () => {
      try { setLeadOptions(await searchCommentLeads({ profileId: form.profileId, query: leadQuery })); }
      catch { setLeadOptions([]); }
    }, 200);
    return () => clearTimeout(timer);
  }, [searchingLeads, form.profileId, leadQuery]);
  useEffect(() => {
    if (!open && !deleting) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); setDeleting(null); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, deleting]);

  const [handledAutoOpen, setHandledAutoOpen] = useState(false);
  if (autoOpen !== handledAutoOpen) {
    setHandledAutoOpen(autoOpen);
    if (autoOpen && profiles.some((profile) => profile.isActive)) openForm();
  }
  // Drop ?log=1 once handled so a refresh doesn't reopen the form.
  useEffect(() => {
    if (!autoOpen) return;
    const params = new URLSearchParams(window.location.search);
    params.delete("log");
    router.replace(`${pathname}${params.size ? `?${params}` : ""}`, { scroll: false });
  }, [autoOpen, pathname, router]);

  function openForm() {
    setForm({ profileId: selectedProfileId || profiles.find((profile) => profile.isActive)?.id || "", postUrl: "", postAuthorName: "", note: "" });
    setWhen(localNow(initial.timezone));
    setLeadQuery("");
    setSelectedLead(null);
    setError("");
    setOpen(true);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const commentedAt = fromZonedTime(when, initial.timezone);
    const result = await createComment({ ...form, leadId: selectedLead?.id, commentedAt: commentedAt.toISOString() });
    setSaving(false);
    if (!result.ok) { setError(result.error); return; }
    setOpen(false);
    if (!selectedProfileId || result.data.profileId === selectedProfileId) {
      setItems((current) => [result.data, ...current].sort((a, b) => b.commentedAt.localeCompare(a.commentedAt)));
    }
    if (result.data.dayKey === today) setProgress((current) => ({ ...current, [result.data.profileId]: (current[result.data.profileId] ?? 0) + 1 }));
    toast.success("Comment logged");
    router.refresh();
  }

  async function loadMore() {
    if (!nextCursor) return;
    setLoading(true);
    try {
      const page = await listComments({ profileId: selectedProfileId, cursor: nextCursor });
      setItems((current) => [...current, ...page.items]);
      setNextCursor(page.nextCursor);
      setProgress(page.progress);
    } catch { toast.error("Could not load more comments. Try again."); }
    finally { setLoading(false); }
  }

  async function remove() {
    if (!deleting) return;
    setSaving(true);
    const result = await deleteComment(deleting.id);
    setSaving(false);
    if (!result.ok) { toast.error(result.error); return; }
    setItems((current) => current.filter((item) => item.id !== deleting.id));
    if (deleting.dayKey === today) setProgress((current) => ({ ...current, [deleting.profileId]: Math.max(0, (current[deleting.profileId] ?? 0) - 1) }));
    setDeleting(null);
    toast.success("Comment removed");
    router.refresh();
  }

  return <div className={styles.page}>
    <div className="page-heading"><div><div className="eyebrow">Engagement log</div><h1 className="page-title">Comments</h1><p className="page-description">Keep track of the conversations you start on other people’s posts.</p></div><button type="button" className="button primary" onClick={openForm} disabled={!profiles.some((profile) => profile.isActive)}><Plus size={16} /> Log comment</button></div>
    {!profiles.some((profile) => profile.isActive) ? <div className="card empty-state"><span className="empty-state-icon"><MessageCircle size={22} /></span><h3>Add a LinkedIn profile first</h3><p>Comments belong to a profile so you can track each account’s daily target.</p><Link href="/profiles" className="button primary">Add profile</Link></div> : <>
      <div className={styles.progressGrid}>{profiles.filter((profile) => profile.isActive && (!selectedProfileId || profile.id === selectedProfileId)).map((profile) => {
        const count = progress[profile.id] ?? 0;
        const target = profile.dailyCommentTarget;
        const percent = target ? Math.min(100, count / target * 100) : 100;
        return <div className={`card ${styles.progressCard}`} key={profile.id}><div className={styles.progressTop}><span className={styles.profileName}><span className={`${styles.dot} ${styles[profile.color]}`} />{profile.name}</span><span className={styles.progressValue}>{count}<span> / {target} today</span></span></div><div className={styles.track}><span style={{ width: `${percent}%` }} /></div></div>;
      })}</div>
      {items.length ? <div className={styles.timeline}>{grouped.map(([day, comments]) => <section key={day}><div className="section-heading"><h2 className="section-title">{dayLabel(day, today)}</h2><span className="section-count">{comments.length}</span></div><div className={styles.dayList}>{comments.map((item) => {
        const profile = profiles.find((candidate) => candidate.id === item.profileId);
        return <article className={`card ${styles.commentCard}`} key={item.id}><div className={styles.commentIcon}><MessageCircle size={16} /></div><div className={styles.commentContent}><div className={styles.commentTop}><strong>{item.postAuthorName || "LinkedIn post"}</strong><time dateTime={item.commentedAt}>{new Intl.DateTimeFormat("en", { timeZone: initial.timezone, hour: "numeric", minute: "2-digit" }).format(new Date(item.commentedAt))}</time></div><div className={styles.meta}><span className={styles.profileName}><span className={`${styles.dot} ${styles[profile?.color ?? "slate"]}`} />{profile?.name ?? "Profile"}</span>{item.leadId && <Link href={`/leads/${item.leadId}`} className={styles.leadLink}><Link2 size={12} />{item.leadName || "Linked lead"}</Link>}</div>{item.note && <p className={styles.note}>{item.note}</p>}<div className={styles.rowActions}><a href={item.postUrl} target="_blank" rel="noopener noreferrer" className="button small"><ExternalLink size={13} /> Open post</a><button type="button" className="button small ghost" onClick={() => setDeleting(item)}><Trash2 size={13} /> Remove</button></div></div></article>;
      })}</div></section>)}</div> : <div className="card empty-state"><span className="empty-state-icon"><MessageCircle size={22} /></span><h3>No comments logged yet</h3><p>Leave a thoughtful comment on a relevant LinkedIn post, then record it here.</p><button type="button" className="button primary" onClick={openForm}>Log your first comment</button></div>}
      {nextCursor && <div className={styles.loadMore}><button type="button" className="button" disabled={loading} onClick={loadMore}>{loading ? "Loading..." : "Load more comments"}</button></div>}
    </>}

    {open && <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}><div className="drawer" role="dialog" aria-modal="true" aria-label="Log comment"><div className="drawer-header"><div><h2>Log comment</h2><p>Record a comment after posting it on LinkedIn.</p></div><button type="button" className="button icon-only ghost" aria-label="Close" onClick={() => setOpen(false)}><X size={17} /></button></div><form className={styles.drawerForm} onSubmit={save}><div className="drawer-body form-stack">
      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="field"><label htmlFor="comment-profile">Profile</label><select id="comment-profile" required value={form.profileId} onChange={(event) => { setForm({ ...form, profileId: event.target.value }); setSelectedLead(null); setLeadQuery(""); }}>{profiles.filter((profile) => profile.isActive).map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></div>
      <div className="field"><label htmlFor="comment-url">LinkedIn post URL</label><input id="comment-url" type="url" autoFocus required value={form.postUrl} onChange={(event) => setForm({ ...form, postUrl: event.target.value })} placeholder="https://www.linkedin.com/posts/..." /></div>
      <div className="field"><label htmlFor="comment-author">Post author (optional)</label><input id="comment-author" maxLength={120} value={form.postAuthorName ?? ""} onChange={(event) => setForm({ ...form, postAuthorName: event.target.value })} placeholder="Name of the person who posted" /></div>
      <div className="field"><label htmlFor="comment-note">Note (optional)</label><textarea id="comment-note" maxLength={2000} value={form.note ?? ""} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="What did you comment, or why does this post matter?" /></div>
      <div className="field"><label htmlFor="comment-when">When</label><input id="comment-when" type="datetime-local" required value={when} onChange={(event) => setWhen(event.target.value)} /><small>Time in {initial.timezone}</small></div>
      <div className="field"><label htmlFor="comment-lead">Link an existing lead (optional)</label>{selectedLead ? <div className={styles.selectedLead}><span><Link2 size={13} /> {selectedLead.fullName}{selectedLead.company ? ` · ${selectedLead.company}` : ""}</span><button type="button" className="button small ghost" onClick={() => { setSelectedLead(null); setLeadQuery(""); }}>Clear</button></div> : <><input id="comment-lead" value={leadQuery} onChange={(event) => setLeadQuery(event.target.value)} placeholder="Search leads in this profile" />{visibleLeadOptions.length > 0 && <div className={styles.leadResults}>{visibleLeadOptions.map((lead) => <button type="button" key={lead.id} onClick={() => { setSelectedLead(lead); setLeadQuery(lead.fullName); if (!form.postAuthorName) setForm({ ...form, postAuthorName: lead.fullName }); }}>{lead.fullName}{lead.company && <span> · {lead.company}</span>}</button>)}</div>}</>}</div>
    </div><div className="drawer-footer"><button type="button" className="button" onClick={() => setOpen(false)}>Cancel</button><button type="submit" className="button primary" disabled={saving}>{saving ? "Saving..." : "Save comment"}</button></div></form></div></div>}
    {deleting && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDeleting(null); }}><div className="modal" role="alertdialog" aria-modal="true" aria-label="Remove comment"><div className="modal-header"><strong>Remove comment from the log?</strong><button type="button" className="button icon-only ghost" aria-label="Close" onClick={() => setDeleting(null)}><X size={17} /></button></div><div className="modal-content"><p>This removes the comment and its activity from your reports. It does not change the LinkedIn post.</p><div className="form-actions"><button type="button" className="button" onClick={() => setDeleting(null)}>Cancel</button><button type="button" className="button danger" disabled={saving} onClick={remove}>{saving ? "Removing..." : "Remove comment"}</button></div></div></div></div>}
  </div>;
}
