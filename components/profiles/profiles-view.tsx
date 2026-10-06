"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ExternalLink, Plus, UserRound, X } from "lucide-react";
import type { ProfileDTO, ProfileInput, ProfileProgressDTO } from "@/actions/profiles";
import { createProfile, deleteProfile, updateProfile } from "@/actions/profiles";
import { profileColors as colors } from "@/lib/constants";
type Form = { name: string; linkedinUrl: string; color: ProfileDTO["color"]; dailyConnectionTarget: number; dailyCommentTarget: number; weeklyInviteLimit: number; isActive: boolean };
const empty: Form = { name: "", linkedinUrl: "", color: "blue", dailyConnectionTarget: 35, dailyCommentTarget: 10, weeklyInviteLimit: 100, isActive: true };

export function ProfilesView({ profiles }: { profiles: ProfileProgressDTO[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(empty);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  function open(profile?: ProfileDTO) { setEditing(profile?.id ?? "new"); setForm(profile ? { name: profile.name, linkedinUrl: profile.linkedinUrl ?? "", color: profile.color, dailyConnectionTarget: profile.dailyConnectionTarget, dailyCommentTarget: profile.dailyCommentTarget, weeklyInviteLimit: profile.weeklyInviteLimit, isActive: profile.isActive } : empty); setError(""); }
  function save() {
    setError("");
    startTransition(async () => {
      const result = editing === "new" ? await createProfile(form as ProfileInput) : await updateProfile(editing!, form);
      if (!result.ok) { setError(result.error); return; }
      setEditing(null); router.refresh(); toast.success(editing === "new" ? "Profile added" : "Profile updated");
    });
  }
  function remove(profile: ProfileDTO) {
    if (!window.confirm(`Remove ${profile.name}? Profiles with activity will be deactivated instead of deleted.`)) return;
    startTransition(async () => { const result = await deleteProfile(profile.id); if (!result.ok) toast.error(result.error); else { toast.success(result.data.deactivated ? "Profile deactivated" : "Profile deleted"); router.refresh(); } });
  }
  const active = profiles.filter(profile => profile.isActive);
  const inactive = profiles.filter(profile => !profile.isActive);
  return <>
    <div className="page-header"><div><div className="eyebrow">Workspace / Profiles</div><h1 className="page-title">Profiles</h1><p className="page-description">Keep each LinkedIn account and its outreach targets separate.</p></div><button className="button primary" onClick={() => open()}><Plus size={15} /> Add profile</button></div>
    {!profiles.length ? <div className="card empty-state"><div className="empty-state-icon"><UserRound size={23} /></div><h3>Add your first LinkedIn profile</h3><p>Every lead and comment belongs to a profile. Start with the account you use most.</p><button className="button primary" onClick={() => open()}>Add profile</button></div> : <><div className="profiles-grid">{active.map(profile => <ProfileCard key={profile.id} profile={profile} onEdit={() => open(profile)} onRemove={() => remove(profile)} />)}</div>{inactive.length > 0 && <><div className="section-heading"><h2 className="section-title">Inactive</h2><span className="section-count">{inactive.length}</span></div><div className="profiles-grid">{inactive.map(profile => <ProfileCard key={profile.id} profile={profile} onEdit={() => open(profile)} onRemove={() => remove(profile)} />)}</div></>}</>}
    {editing && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setEditing(null); }}><div className="modal" role="dialog" aria-modal="true" aria-label={editing === "new" ? "Add profile" : "Edit profile"}><div className="modal-header"><strong>{editing === "new" ? "Add LinkedIn profile" : "Edit profile"}</strong><button className="button icon-only ghost" aria-label="Close" onClick={() => setEditing(null)}><X size={17} /></button></div><div className="modal-content form-stack"><div className="field"><label htmlFor="profile-name">Profile name</label><input id="profile-name" autoFocus value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="Ali – Main" /></div><div className="field"><label htmlFor="profile-url">LinkedIn URL</label><input id="profile-url" type="url" value={form.linkedinUrl} onChange={event => setForm({ ...form, linkedinUrl: event.target.value })} placeholder="https://www.linkedin.com/in/your-name/" /></div><div className="field"><label>Badge colour</label><div className="color-options">{colors.map(color => <button key={color} type="button" aria-label={`${color} badge`} aria-pressed={form.color === color} title={color} className={`color-option ${form.color === color ? "selected" : ""}`} onClick={() => setForm({ ...form, color })}><i className={`profile-dot color-${color}`} /></button>)}</div></div><div className="field-grid"><div className="field"><label htmlFor="daily-requests">Daily connection target</label><input id="daily-requests" type="number" min={0} value={form.dailyConnectionTarget} onChange={event => setForm({ ...form, dailyConnectionTarget: Number(event.target.value) })} /></div><div className="field"><label htmlFor="daily-comments">Daily comment target</label><input id="daily-comments" type="number" min={0} value={form.dailyCommentTarget} onChange={event => setForm({ ...form, dailyCommentTarget: Number(event.target.value) })} /></div></div><div className="field"><label htmlFor="weekly-limit">Weekly invitation limit</label><input id="weekly-limit" type="number" min={1} value={form.weeklyInviteLimit} onChange={event => setForm({ ...form, weeklyInviteLimit: Number(event.target.value) })} /><small>An amber warning appears at 80%, red at 100%.</small></div>{editing !== "new" && <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={form.isActive} onChange={event => setForm({ ...form, isActive: event.target.checked })} /> Active profile</label>}{error && <div className="form-error" role="alert">{error}</div>}<div className="form-actions"><button className="button" onClick={() => setEditing(null)}>Cancel</button><button className="button primary" disabled={isPending || !form.name.trim()} onClick={save}>{isPending ? "Saving..." : editing === "new" ? "Add profile" : "Save changes"}</button></div></div></div></div>}
  </>;
}

function ProfileCard({ profile, onEdit, onRemove }: { profile: ProfileProgressDTO; onEdit: () => void; onRemove: () => void }) {
  const weekly = Math.min(100, profile.requestsLast7Days / profile.weeklyInviteLimit * 100);
  return <div className="card profile-card"><div className="profile-card-header"><span className={`profile-card-mark color-${profile.color}`}><UserRound size={19} /></span><div style={{ flex: 1, minWidth: 0 }}><h2>{profile.name}</h2><span className="muted" style={{ fontSize: 11 }}>{profile.isActive ? "Active profile" : "Inactive profile"}</span></div>{profile.linkedinUrl && <a className="button icon-only ghost" href={profile.linkedinUrl} target="_blank" rel="noopener noreferrer" aria-label="Open LinkedIn profile"><ExternalLink size={15} /></a>}</div><div className="profile-stats"><div><strong className="tabular">{profile.requestsLast30Days}</strong><span>Requests</span></div><div><strong className="tabular">{Math.round(profile.acceptanceRate)}%</strong><span>Accepted</span></div><div><strong className="tabular">{Math.round(profile.replyRate)}%</strong><span>Replied</span></div><div><strong className="tabular">{profile.meetingsLast30Days}</strong><span>Meetings</span></div></div><div className="profile-weekly"><div className="progress-label"><span>Invitations in the last 7 days</span><strong className={`tabular weekly-status ${profile.weeklyWarning}`}>{profile.requestsLast7Days}/{profile.weeklyInviteLimit}</strong></div><div className="meter"><span style={{ width: `${weekly}%`, background: profile.weeklyWarning === "red" ? "var(--danger)" : profile.weeklyWarning === "amber" ? "var(--warning)" : "var(--primary)" }} /></div></div><div className="profile-card-footer"><span className="muted" style={{ fontSize: 11 }}>{profile.pendingRequests} pending · Targets {profile.dailyConnectionTarget} requests / {profile.dailyCommentTarget} comments</span><div><button className="button small" onClick={onEdit}>Edit</button><button className="button small ghost" onClick={onRemove}>Remove</button></div></div></div>;
}
