"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Clock3, KeyRound, ListFilter, Palette, Save, UserRound, X } from "lucide-react";
import type { AccountDTO } from "@/actions/settings";
import { changePassword, updateAccount, updateSettings } from "@/actions/settings";
import { CountrySelect } from "@/components/ui/country-select";
import { countryFlag, countryName } from "@/lib/countries";
import type { UserSettings } from "@/models/User";

const commonTimezones = [
  "Asia/Karachi", "Asia/Dubai", "Asia/Riyadh", "Asia/Qatar", "Asia/Kolkata", "Asia/Singapore",
  "Europe/London", "Europe/Berlin", "Europe/Amsterdam", "America/New_York", "America/Chicago",
  "America/Los_Angeles", "America/Toronto", "Australia/Sydney", "UTC",
];

function Section({ icon: Icon, title, description, children }: { icon: typeof Clock3; title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="card settings-section">
      <div className="settings-heading">
        <span className="empty-state-icon"><Icon size={18} /></span>
        <div><h2>{title}</h2><p>{description}</p></div>
      </div>
      {children}
    </section>
  );
}

function ChipList({ items, render = (item) => item, onRemove }: { items: string[]; render?: (item: string) => React.ReactNode; onRemove: (item: string) => void }) {
  if (!items.length) return <p className="muted chip-empty">None yet.</p>;
  return (
    <div className="chip-list">
      {items.map((item) => (
        <span key={item} className="tag-chip">{render(item)}<button type="button" aria-label={`Remove ${item}`} onClick={() => onRemove(item)}><X size={12} /></button></span>
      ))}
    </div>
  );
}

function TextListEditor({ id, label, hint, items, placeholder, onChange }: { id: string; label: string; hint: string; items: string[]; placeholder: string; onChange: (items: string[]) => void }) {
  const [draft, setDraft] = useState("");
  function add() {
    const value = draft.trim();
    if (value && !items.some((item) => item.toLowerCase() === value.toLowerCase())) onChange([...items, value]);
    setDraft("");
  }
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <ChipList items={items} onRemove={(item) => onChange(items.filter((value) => value !== item))} />
      <div className="inline-add">
        <input id={id} value={draft} placeholder={placeholder} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); add(); } }} />
        <button type="button" className="button" disabled={!draft.trim()} onClick={add}>Add</button>
      </div>
      <small>{hint}</small>
    </div>
  );
}

export function SettingsView({ settings, account }: { settings: UserSettings; account: AccountDTO }) {
  const router = useRouter();
  const [form, setForm] = useState(settings);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const timezones = commonTimezones.includes(form.timezone) ? commonTimezones : [form.timezone, ...commonTimezones];
  const dirty = JSON.stringify(form) !== JSON.stringify(settings);

  function save() {
    setError("");
    startTransition(async () => {
      const result = await updateSettings(form);
      if (!result.ok) { setError(result.error); return; }
      toast.success("Settings saved");
      router.refresh();
    });
  }

  const number = (key: "followUpGapDays" | "maxFollowUps" | "staleRequestDays") => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [key]: Number(event.target.value) });

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-description">Make reminders and lists fit the way you work.</p>
        </div>
      </div>
      <div className="settings-stack">
        <Section icon={Clock3} title="Timing" description="Days are counted as calendar days in your timezone.">
          <div className="field-grid">
            <div className="field">
              <label htmlFor="timezone">Timezone</label>
              <select id="timezone" value={form.timezone} onChange={(event) => setForm({ ...form, timezone: event.target.value })}>
                {timezones.map((zone) => <option key={zone} value={zone}>{zone.replaceAll("_", " ")}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="follow-gap">Days between follow-ups</label>
              <input id="follow-gap" type="number" min={1} max={365} value={form.followUpGapDays} onChange={number("followUpGapDays")} />
            </div>
            <div className="field">
              <label htmlFor="max-follow">Maximum follow-ups</label>
              <input id="max-follow" type="number" min={1} max={10} value={form.maxFollowUps} onChange={number("maxFollowUps")} />
              <small>After the last one, the lead shows under “Close or retry”.</small>
            </div>
            <div className="field">
              <label htmlFor="stale-after">Stale request after (days)</label>
              <input id="stale-after" type="number" min={1} max={365} value={form.staleRequestDays} onChange={number("staleRequestDays")} />
              <small>Pending requests older than this are suggested for withdrawal.</small>
            </div>
          </div>
        </Section>

        <Section icon={ListFilter} title="Lists" description="The choices offered when you add and filter leads.">
          <div className="form-stack">
            <div className="field">
              <label htmlFor="priority-country">Priority countries</label>
              <ChipList
                items={form.countries}
                render={(code) => <>{countryFlag(code)} {countryName(code)}</>}
                onRemove={(code) => setForm({ ...form, countries: form.countries.filter((item) => item !== code) })}
              />
              <div className="inline-add">
                <CountrySelect id="priority-country" value="" onChange={(code) => { if (!form.countries.includes(code)) setForm({ ...form, countries: [...form.countries, code] }); }} />
              </div>
              <small>Shown first, in this order, in every country dropdown.</small>
            </div>
            <TextListEditor id="services" label="Services and campaigns" placeholder="e.g. Web development" hint="Offered when adding leads and matched against templates." items={form.services} onChange={(services) => setForm({ ...form, services })} />
            <TextListEditor id="tags" label="Tags" placeholder="e.g. Hot lead" hint="Suggested when tagging leads." items={form.tags} onChange={(tags) => setForm({ ...form, tags })} />
          </div>
        </Section>

        <Section icon={Palette} title="Appearance" description="Also available from the account menu.">
          <div className="field" style={{ maxWidth: 280 }}>
            <label htmlFor="theme">Theme</label>
            <select id="theme" value={form.theme} onChange={(event) => setForm({ ...form, theme: event.target.value as UserSettings["theme"] })}>
              <option value="system">Use system setting</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>
        </Section>

        {error && <div className="form-error" role="alert">{error}</div>}
        <div className="form-actions sticky-save">
          {dirty && <button type="button" className="button" onClick={() => setForm(settings)}>Discard</button>}
          <button type="button" className="button primary" disabled={isPending || !dirty} onClick={save}><Save size={15} />{isPending ? "Saving…" : "Save settings"}</button>
        </div>

        <AccountSection account={account} />
        <PasswordSection />
      </div>
    </>
  );
}

function AccountSection({ account }: { account: AccountDTO }) {
  const router = useRouter();
  const [form, setForm] = useState(account);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const dirty = form.name !== account.name || form.email !== account.email;
  return (
    <Section icon={UserRound} title="Account" description="The name and email you sign in with.">
      <form className="form-stack" onSubmit={(event) => {
        event.preventDefault();
        setError("");
        startTransition(async () => {
          const result = await updateAccount(form);
          if (!result.ok) { setError(result.error); return; }
          toast.success("Account updated");
          router.refresh();
        });
      }}>
        <div className="field-grid">
          <div className="field"><label htmlFor="account-name">Name</label><input id="account-name" autoComplete="name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div>
          <div className="field"><label htmlFor="account-email">Email</label><input id="account-email" type="email" autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></div>
        </div>
        {error && <div className="form-error" role="alert">{error}</div>}
        <div className="form-actions"><button type="submit" className="button primary" disabled={!dirty || isPending}>{isPending ? "Saving…" : "Save account"}</button></div>
      </form>
    </Section>
  );
}

function PasswordSection() {
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  return (
    <Section icon={KeyRound} title="Password" description="Use at least 12 characters.">
      <form className="form-stack" onSubmit={(event) => {
        event.preventDefault();
        setError("");
        if (newPassword !== confirm) { setError("The new passwords don't match."); return; }
        startTransition(async () => {
          const result = await changePassword({ currentPassword, newPassword });
          if (!result.ok) { setError(result.error); return; }
          setCurrent(""); setNew(""); setConfirm("");
          toast.success("Password changed");
        });
      }}>
        <div className="field-grid">
          <div className="field"><label htmlFor="current-password">Current password</label><input id="current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrent(event.target.value)} /></div>
          <div />
          <div className="field"><label htmlFor="new-password">New password</label><input id="new-password" type="password" autoComplete="new-password" minLength={12} value={newPassword} onChange={(event) => setNew(event.target.value)} /></div>
          <div className="field"><label htmlFor="confirm-password">Confirm new password</label><input id="confirm-password" type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} /></div>
        </div>
        {error && <div className="form-error" role="alert">{error}</div>}
        <div className="form-actions"><button type="submit" className="button primary" disabled={isPending || !currentPassword || !newPassword}>{isPending ? "Changing…" : "Change password"}</button></div>
      </form>
    </Section>
  );
}
