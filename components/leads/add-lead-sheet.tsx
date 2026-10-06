"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, Check, ClipboardPaste, Copy, Plus, X } from "lucide-react";
import { toast } from "sonner";
import type { ProfileDTO } from "@/actions/profiles";
import { createLead, createLeadsBulk, findDuplicateLeads, type DuplicateMatch } from "@/actions/leads";
import { CountrySelect } from "@/components/ui/country-select";
import { parseLinkedInProfileUrl } from "@/lib/linkedin-url";
import type { UserSettings } from "@/models/User";

type Mode = "single" | "bulk";

const LAST_PROFILE = "leadflow-last-profile";
const LAST_COUNTRY = "leadflow-last-country";

function readSaved(key: string): string {
  try { return localStorage.getItem(key) ?? ""; } catch { return ""; }
}
function remember(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* storage unavailable */ }
}

/** Looks up existing leads for these normalized URLs whenever the set changes. */
function useDuplicates(normalizedUrls: string[]): Record<string, DuplicateMatch> {
  const key = [...new Set(normalizedUrls)].sort().join("\n");
  const [result, setResult] = useState<{ key: string; matches: Record<string, DuplicateMatch> }>({ key: "", matches: {} });
  useEffect(() => {
    if (!key) return;
    let current = true;
    const timer = setTimeout(async () => {
      try {
        const matches = await findDuplicateLeads(key.split("\n"));
        if (current) setResult({ key, matches });
      } catch { /* the server re-checks on save */ }
    }, 300);
    return () => { current = false; clearTimeout(timer); };
  }, [key]);
  return result.key === key ? result.matches : {};
}

type Props = {
  mode: Mode | null;
  onClose: () => void;
  profiles: ProfileDTO[];
  settings: UserSettings;
  onSaved: () => void;
};

export function AddLeadSheet({ mode, ...props }: Props) {
  if (!mode) return null;
  // Remount per opening so remembered profile/country are read fresh.
  return <AddLeadForm key={mode} initialMode={mode} {...props} />;
}

function AddLeadForm({ initialMode, onClose, profiles, settings, onSaved }: Omit<Props, "mode"> & { initialMode: Mode }) {
  const activeProfiles = profiles.filter((profile) => profile.isActive);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [profileId, setProfileId] = useState(() => {
    const saved = readSaved(LAST_PROFILE);
    return activeProfiles.some((profile) => profile.id === saved) ? saved : activeProfiles[0]?.id ?? "";
  });
  const [country, setCountry] = useState(() => readSaved(LAST_COUNTRY) || settings.countries[0] || "US");
  const [service, setService] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function saveShared() {
    remember(LAST_PROFILE, profileId);
    remember(LAST_COUNTRY, country);
  }

  const shared = (
    <>
      <div className="field-grid">
        <div className="field">
          <label htmlFor="lead-profile">Profile <span className="muted">*</span></label>
          <select id="lead-profile" value={profileId} onChange={(event) => setProfileId(event.target.value)}>
            {activeProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="lead-country">Country <span className="muted">*</span></label>
          <CountrySelect id="lead-country" value={country} onChange={setCountry} priority={settings.countries} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="lead-service">Service or campaign</label>
        {settings.services.length ? (
          <select id="lead-service" value={service} onChange={(event) => setService(event.target.value)}>
            <option value="">None</option>
            {settings.services.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        ) : (
          <>
            <input id="lead-service" value={service} onChange={(event) => setService(event.target.value)} placeholder="Optional" />
            <small>Add your services in <Link href="/settings" onClick={onClose}>Settings</Link> to pick them from a list.</small>
          </>
        )}
      </div>
    </>
  );

  return (
    <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="drawer" role="dialog" aria-modal="true" aria-label="Add leads">
        <div className="drawer-header">
          <div><h2>Add leads</h2><p>Log the connection requests you sent on LinkedIn.</p></div>
          <button type="button" className="button icon-only ghost" onClick={onClose} aria-label="Close"><X size={19} /></button>
        </div>
        {!activeProfiles.length ? (
          <div className="drawer-body">
            <div className="empty-state card">
              <h3>Create a profile first</h3>
              <p>Every lead belongs to one of your LinkedIn profiles.</p>
              <Link href="/profiles" className="button primary" onClick={onClose}>Add profile</Link>
            </div>
          </div>
        ) : (
          <>
            <div className="segmented" role="tablist" aria-label="Add mode">
              <button type="button" role="tab" aria-selected={mode === "single"} className={mode === "single" ? "active" : ""} onClick={() => { setMode("single"); setError(""); }}><Plus size={15} /> Single lead</button>
              <button type="button" role="tab" aria-selected={mode === "bulk"} className={mode === "bulk" ? "active" : ""} onClick={() => { setMode("bulk"); setError(""); }}><ClipboardPaste size={15} /> Bulk add</button>
            </div>
            {mode === "single" ? (
              <SingleForm
                shared={shared} profiles={profiles} error={error} setError={setError} isPending={isPending}
                onClose={onClose}
                onSubmit={(input, addAnother, reset) => {
                  setError("");
                  startTransition(async () => {
                    const result = await createLead({ ...input, profileId, country, service: service || undefined });
                    if (!result.ok) { setError(result.error); return; }
                    saveShared();
                    onSaved();
                    toast.success(`${result.data.fullName} added`);
                    if (addAnother) reset(); else onClose();
                  });
                }}
              />
            ) : (
              <BulkForm
                shared={shared} profiles={profiles} error={error} isPending={isPending} onClose={onClose}
                onSubmit={(urls, allowDuplicates, setText) => {
                  setError("");
                  startTransition(async () => {
                    const result = await createLeadsBulk({ urls, profileId, country, service: service || undefined, allowDuplicates });
                    if (!result.ok) { setError(result.error); return; }
                    saveShared();
                    const { created, skipped } = result.data;
                    if (created.length) { onSaved(); toast.success(`${created.length} lead${created.length === 1 ? "" : "s"} added`); }
                    if (skipped.length) {
                      setError(`${skipped.length} line${skipped.length === 1 ? " was" : "s were"} skipped (invalid or duplicate). They're left below so you can fix them.`);
                      setText(skipped.map((row) => row.url).join("\n"));
                    } else onClose();
                  });
                }}
              />
            )}
          </>
        )}
      </section>
    </div>
  );
}

type SingleInput = { linkedinUrl: string; fullName: string; role?: string; company?: string; allowDuplicate: boolean };

function SingleForm({ shared, profiles, error, setError, isPending, onClose, onSubmit }: {
  shared: React.ReactNode;
  profiles: ProfileDTO[];
  error: string;
  setError: (error: string) => void;
  isPending: boolean;
  onClose: () => void;
  onSubmit: (input: SingleInput, addAnother: boolean, reset: () => void) => void;
}) {
  const urlRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState("");
  const [name, setName] = useState<string | null>(null);
  const [role, setRole] = useState("");
  const [company, setCompany] = useState("");
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const parsed = parseLinkedInProfileUrl(url);
  const duplicates = useDuplicates(parsed ? [parsed.normalizedUrl] : []);
  const duplicate = parsed ? duplicates[parsed.normalizedUrl] : undefined;
  const duplicateProfile = duplicate && profiles.find((profile) => profile.id === duplicate.profileId);
  const fullName = name ?? parsed?.suggestedName ?? "";

  function reset() {
    setUrl(""); setName(null); setRole(""); setCompany(""); setAllowDuplicate(false);
    urlRef.current?.focus();
  }

  function submit(addAnother: boolean) {
    if (!parsed) { setError("Enter a LinkedIn profile URL, like linkedin.com/in/ahmed-khan."); urlRef.current?.focus(); return; }
    if (duplicate && !allowDuplicate) { setError("This lead is already saved. Open it, or tick “Save anyway”."); return; }
    onSubmit({ linkedinUrl: url.trim(), fullName: fullName.trim() || parsed.suggestedName, role: role.trim() || undefined, company: company.trim() || undefined, allowDuplicate }, addAnother, reset);
  }

  return (
    <form className="drawer-form" onSubmit={(event) => { event.preventDefault(); submit(false); }}>
      <div className="drawer-body form-stack">
        <div className="field">
          <label htmlFor="lead-url">LinkedIn profile URL <span className="muted">*</span></label>
          <input ref={urlRef} id="lead-url" autoFocus value={url} onChange={(event) => { setUrl(event.target.value); setAllowDuplicate(false); }} placeholder="https://www.linkedin.com/in/ahmed-khan/" inputMode="url" autoComplete="off" />
          {url.trim() && !parsed && <small className="field-warning">This doesn&apos;t look like a LinkedIn profile URL (linkedin.com/in/…).</small>}
          {duplicate && (
            <div className="form-warning" role="status">
              <AlertTriangle size={14} />
              <div>
                Already saved as <Link href={`/leads/${duplicate.id}`} onClick={onClose}>{duplicate.fullName}</Link>
                {duplicateProfile ? <> under <strong>{duplicateProfile.name}</strong></> : null}.
                <label className="checkbox-row"><input type="checkbox" checked={allowDuplicate} onChange={(event) => setAllowDuplicate(event.target.checked)} /> Save anyway</label>
              </div>
            </div>
          )}
        </div>
        <div className="field">
          <label htmlFor="lead-name">Full name</label>
          <input id="lead-name" value={fullName} onChange={(event) => setName(event.target.value)} placeholder="Ahmed Khan" />
          <small>Filled in from the URL. Edit it if LinkedIn shows a different name.</small>
        </div>
        {shared}
        <div className="field-grid">
          <div className="field"><label htmlFor="lead-role">Role</label><input id="lead-role" value={role} onChange={(event) => setRole(event.target.value)} placeholder="Optional" /></div>
          <div className="field"><label htmlFor="lead-company">Company</label><input id="lead-company" value={company} onChange={(event) => setCompany(event.target.value)} placeholder="Optional" /></div>
        </div>
        {error && <div className="form-error" role="alert">{error}</div>}
      </div>
      <div className="drawer-footer">
        <button type="button" className="button" onClick={onClose}>Cancel</button>
        <button type="button" className="button" disabled={isPending} onClick={() => submit(true)}>Save &amp; add another</button>
        <button type="submit" className="button primary" disabled={isPending}>{isPending ? "Saving…" : "Save"}</button>
      </div>
    </form>
  );
}

type BulkRow = { line: number; raw: string; name: string; normalized?: string; status: "ready" | "invalid" | "existing" | "repeat"; existing?: DuplicateMatch };

function BulkForm({ shared, profiles, error, isPending, onClose, onSubmit }: {
  shared: React.ReactNode;
  profiles: ProfileDTO[];
  error: string;
  isPending: boolean;
  onClose: () => void;
  onSubmit: (urls: string[], allowDuplicates: boolean, setText: (text: string) => void) => void;
}) {
  const [text, setText] = useState("");
  const [allowDuplicates, setAllowDuplicates] = useState(false);
  const parsedLines = useMemo(() => text.split(/\r?\n/).map((raw) => raw.trim()).filter(Boolean)
    .map((raw, line) => ({ line, raw, parsed: parseLinkedInProfileUrl(raw) })), [text]);
  const existing = useDuplicates(parsedLines.flatMap((row) => row.parsed ? [row.parsed.normalizedUrl] : []));
  const rows: BulkRow[] = useMemo(() => {
    const seen = new Set<string>();
    return parsedLines.map(({ line, raw, parsed }) => {
      if (!parsed) return { line, raw, name: "", status: "invalid" as const };
      const normalized = parsed.normalizedUrl;
      const status = existing[normalized] ? "existing" as const : seen.has(normalized) ? "repeat" as const : "ready" as const;
      seen.add(normalized);
      return { line, raw, name: parsed.suggestedName, normalized, status, existing: existing[normalized] };
    });
  }, [parsedLines, existing]);
  const counts = {
    ready: rows.filter((row) => row.status === "ready").length,
    duplicate: rows.filter((row) => row.status === "existing" || row.status === "repeat").length,
    invalid: rows.filter((row) => row.status === "invalid").length,
  };
  const toAdd = counts.ready + (allowDuplicates ? counts.duplicate : 0);
  const tooMany = rows.length > 100;

  function submit() {
    // Invalid and duplicate lines are sent too: the server skips them and they're left in the box to fix.
    onSubmit(rows.map((row) => row.raw), allowDuplicates, setText);
  }

  return (
    <form className="drawer-form" onSubmit={(event) => { event.preventDefault(); submit(); }}>
      <div className="drawer-body form-stack">
        <div className="field">
          <label htmlFor="bulk-urls">LinkedIn profile URLs, one per line</label>
          <textarea id="bulk-urls" className="bulk-textarea" autoFocus value={text} onChange={(event) => setText(event.target.value)} placeholder={"https://www.linkedin.com/in/ahmed-khan/\nhttps://www.linkedin.com/in/sarah-lee/"} />
          <small>
            {rows.length} pasted · {counts.ready} new
            {counts.duplicate ? ` · ${counts.duplicate} duplicate` : ""}
            {counts.invalid ? ` · ${counts.invalid} invalid` : ""}
            {tooMany ? " · Up to 100 per batch" : ""}
          </small>
        </div>
        {shared}
        {rows.length > 0 && (
          <div className="card bulk-preview">
            <div className="bulk-preview-head">Preview</div>
            <ul>
              {rows.map((row) => {
                const owner = row.existing && profiles.find((profile) => profile.id === row.existing!.profileId);
                return (
                  <li key={row.line} className={row.status}>
                    <span className="bulk-icon" aria-hidden>{row.status === "ready" ? <Check size={14} /> : row.status === "invalid" ? <AlertTriangle size={14} /> : <Copy size={14} />}</span>
                    <span className="bulk-name">{row.name || row.raw}</span>
                    <span className="bulk-status">
                      {row.status === "ready" && "New"}
                      {row.status === "invalid" && "Not a profile URL"}
                      {row.status === "repeat" && "Repeated in this list"}
                      {row.status === "existing" && <>Saved{owner ? ` under ${owner.name}` : ""}</>}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {counts.duplicate > 0 && (
          <label className="checkbox-row"><input type="checkbox" checked={allowDuplicates} onChange={(event) => setAllowDuplicates(event.target.checked)} /> Add duplicates anyway</label>
        )}
        {error && <div className="form-error" role="alert">{error}</div>}
      </div>
      <div className="drawer-footer">
        <button type="button" className="button" onClick={onClose}>Cancel</button>
        <button type="submit" className="button primary" disabled={isPending || toAdd === 0 || tooMany}>
          {isPending ? "Adding…" : `Add ${toAdd} lead${toAdd === 1 ? "" : "s"}`}
        </button>
      </div>
    </form>
  );
}
