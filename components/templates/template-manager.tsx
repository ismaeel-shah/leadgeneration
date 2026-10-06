"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Copy, FileText, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import type { ProfileDTO } from "@/actions/profiles";
import {
  createTemplate, deleteTemplate, updateTemplate,
  type TemplateDTO, type TemplateInput,
} from "@/actions/templates";
import { fillTemplate, type TemplateType } from "@/lib/templates";
import styles from "./templates.module.css";

const groups: Array<{ type: TemplateType; title: string; hint: string }> = [
  { type: "connection_note", title: "Connection notes", hint: "Short introductions sent with a request" },
  { type: "first_message", title: "First messages", hint: "Your first message after an acceptance" },
  { type: "follow_up_1", title: "Follow-up 1", hint: "The first check-in" },
  { type: "follow_up_2", title: "Follow-up 2", hint: "A final thoughtful nudge" },
  { type: "other", title: "Other", hint: "Reusable messages for your own workflow" },
];

function emptyForm(type: TemplateType = "first_message"): TemplateInput {
  return { name: "", type, country: "", service: "", isDefault: false, body: "" };
}

export function TemplateManager({ initialTemplates, profiles, countries, services }: {
  initialTemplates: TemplateDTO[];
  profiles: ProfileDTO[];
  countries: string[];
  services: string[];
}) {
  const router = useRouter();
  const [templates, setTemplates] = useState(initialTemplates);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<TemplateInput>(emptyForm());
  const [sample, setSample] = useState({ fullName: "Ahmed Khan", company: "Nexa", role: "CTO", country: "AE", service: "Consulting" });
  const [sampleProfile, setSampleProfile] = useState(profiles[0]?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<TemplateDTO | null>(null);
  const [error, setError] = useState("");
  const preview = useMemo(() => fillTemplate(form.body, {
    ...sample,
    firstName: sample.fullName.trim().split(/\s+/)[0],
  }, profiles.find((profile) => profile.id === sampleProfile)?.name ?? "Ali – Main"), [form.body, sample, profiles, sampleProfile]);

  useEffect(() => {
    if (!editing && !deleting) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setEditing(null); setDeleting(null); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [editing, deleting]);

  function openNew(type: TemplateType = "first_message") {
    setForm(emptyForm(type));
    setError("");
    setEditing("new");
  }

  function openEdit(template: TemplateDTO) {
    setForm({ name: template.name, type: template.type, country: template.country ?? "", service: template.service ?? "", isDefault: template.isDefault, body: template.body });
    setError("");
    setEditing(template.id);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    setSaving(true);
    setError("");
    const result = editing === "new" ? await createTemplate(form) : await updateTemplate(editing, form);
    setSaving(false);
    if (!result.ok) { setError(result.error); return; }
    setTemplates((current) => {
      const next = current.filter((item) => item.id !== result.data.id).map((item) =>
        result.data.isDefault && item.type === result.data.type ? { ...item, isDefault: false } : item,
      );
      return [...next, result.data];
    });
    setEditing(null);
    toast.success(editing === "new" ? "Template added" : "Template updated");
    router.refresh();
  }

  async function remove() {
    if (!deleting) return;
    setSaving(true);
    const result = await deleteTemplate(deleting.id);
    setSaving(false);
    if (!result.ok) { toast.error(result.error); return; }
    setTemplates((current) => current.filter((item) => item.id !== deleting.id));
    setDeleting(null);
    toast.success("Template deleted");
    router.refresh();
  }

  async function copy(template: TemplateDTO) {
    try {
      const message = fillTemplate(template.body, {
        ...sample,
        firstName: sample.fullName.trim().split(/\s+/)[0],
      }, profiles.find((profile) => profile.id === sampleProfile)?.name ?? "Ali – Main");
      await navigator.clipboard.writeText(message);
      toast.success("Message copied");
    } catch {
      toast.error("Could not copy the message. Check clipboard access.");
    }
  }

  return <div className={styles.page}>
    <div className="page-heading">
      <div><div className="eyebrow">Message library</div><h1 className="page-title">Templates</h1><p className="page-description">Write once, personalize for each lead when you copy.</p></div>
      <button type="button" className="button primary" onClick={() => openNew()}><Plus size={16} /> Add template</button>
    </div>
    <div className={styles.intro}>
      <FileText size={17} /><span>Placeholders: <code>{"{{firstName}}"}</code>, <code>{"{{fullName}}"}</code>, <code>{"{{company}}"}</code>, <code>{"{{role}}"}</code>, <code>{"{{country}}"}</code>, <code>{"{{service}}"}</code>, <code>{"{{myName}}"}</code>.</span>
    </div>
    {groups.map((group) => {
      const items = templates.filter((template) => template.type === group.type).sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name));
      return <section key={group.type} className={styles.group}>
        <div className={styles.groupHeader}><div><h2 className="section-title">{group.title} <span className="section-count">{items.length}</span></h2><span className="section-subtitle">{group.hint}</span></div><button type="button" className="button small" onClick={() => openNew(group.type)}><Plus size={13} /> Add</button></div>
        {items.length ? <div className={styles.grid}>{items.map((template) => <article className={`card ${styles.templateCard}`} key={template.id}>
          <div className={styles.cardTop}><strong>{template.name}</strong><div className={styles.badges}>{template.isDefault && <span className="badge blue">Default</span>}{template.country && <span className="badge">{template.country}</span>}{template.service && <span className="badge">{template.service}</span>}</div></div>
          <p className={styles.body}>{template.body}</p>
          {template.type === "connection_note" && template.body.length > 300 && <span className={styles.warning}>Over 300 characters</span>}
          <div className={styles.cardActions}><button type="button" className="button small" onClick={() => copy(template)}><Copy size={13} /> Copy sample</button><button type="button" className="button small ghost" onClick={() => openEdit(template)}><Pencil size={13} /> Edit</button><button type="button" className="button small ghost" onClick={() => setDeleting(template)} aria-label={`Delete ${template.name}`}><Trash2 size={13} /></button></div>
        </article>)}</div> : <div className={`card ${styles.emptyGroup}`}><span>No {group.title.toLowerCase()} yet.</span><button type="button" className="button small" onClick={() => openNew(group.type)}>Create one</button></div>}
      </section>;
    })}

    {editing && <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(null); }}><div className="drawer" role="dialog" aria-modal="true" aria-label={editing === "new" ? "Add template" : "Edit template"}>
      <div className="drawer-header"><div><h2>{editing === "new" ? "Add template" : "Edit template"}</h2><p>Target a country or service, or make a general default.</p></div><button type="button" className="button icon-only ghost" aria-label="Close" onClick={() => setEditing(null)}><X size={17} /></button></div>
      <form className={styles.drawerForm} onSubmit={save}>
        <div className="drawer-body form-stack">
          {error && <div className="form-error" role="alert">{error}</div>}
          <div className="field"><label htmlFor="template-name">Name</label><input id="template-name" autoFocus required maxLength={100} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="A useful label for this message" /></div>
          <div className="field"><label htmlFor="template-type">Type</label><select id="template-type" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as TemplateType })}>{groups.map((group) => <option key={group.type} value={group.type}>{group.title}</option>)}</select></div>
          <div className="field-grid"><div className="field"><label htmlFor="template-country">Country (optional)</label><input id="template-country" maxLength={2} list="template-countries" value={form.country ?? ""} onChange={(event) => setForm({ ...form, country: event.target.value.toUpperCase(), isDefault: false })} placeholder="Any country" /><datalist id="template-countries">{countries.map((country) => <option value={country} key={country} />)}</datalist></div><div className="field"><label htmlFor="template-service">Service (optional)</label><input id="template-service" list="template-services" value={form.service ?? ""} onChange={(event) => setForm({ ...form, service: event.target.value, isDefault: false })} placeholder="Any service" /><datalist id="template-services">{services.map((service) => <option value={service} key={service} />)}</datalist></div></div>
          <label className={styles.checkRow}><input type="checkbox" checked={form.isDefault ?? false} disabled={!!form.country || !!form.service} onChange={(event) => setForm({ ...form, isDefault: event.target.checked })} /><span>Default for this type <small>Used when no targeted template matches.</small></span></label>
          <div className="field"><label htmlFor="template-body">Message</label><textarea id="template-body" required rows={8} maxLength={5000} value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} placeholder={"Hi {{firstName}}, I noticed your work at {{company}}..."} /><div className={styles.counter}><span>{form.type === "connection_note" && form.body.length > 300 ? "Connection note exceeds 300 characters." : "Use placeholders to personalize when copying."}</span><strong className={form.type === "connection_note" && form.body.length > 300 ? styles.warning : ""}>{form.body.length}{form.type === "connection_note" ? "/300" : " characters"}</strong></div></div>
          <div className={styles.previewBlock}><div className={styles.previewHeading}><strong>Live preview</strong><span>Sample lead</span></div><div className={styles.sampleFields}><input aria-label="Sample full name" value={sample.fullName} onChange={(event) => setSample({ ...sample, fullName: event.target.value })} placeholder="Full name" /><input aria-label="Sample company" value={sample.company} onChange={(event) => setSample({ ...sample, company: event.target.value })} placeholder="Company" /><input aria-label="Sample role" value={sample.role} onChange={(event) => setSample({ ...sample, role: event.target.value })} placeholder="Role" /><select aria-label="Sample profile" value={sampleProfile} onChange={(event) => setSampleProfile(event.target.value)}><option value="">Ali – Main</option>{profiles.map((profile) => <option value={profile.id} key={profile.id}>{profile.name}</option>)}</select></div><p className={styles.previewText}>{preview || "Your message will appear here as you write."}</p></div>
        </div>
        <div className="drawer-footer"><button type="button" className="button" onClick={() => setEditing(null)}>Cancel</button><button type="submit" className="button primary" disabled={saving}>{saving ? "Saving..." : "Save template"}</button></div>
      </form>
    </div></div>}
    {deleting && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDeleting(null); }}><div className="modal" role="alertdialog" aria-modal="true" aria-label="Delete template"><div className="modal-header"><strong>Delete template?</strong><button type="button" className="button icon-only ghost" aria-label="Close" onClick={() => setDeleting(null)}><X size={17} /></button></div><div className="modal-content"><p>“{deleting.name}” will be removed from your message library.</p><div className="form-actions"><button type="button" className="button" onClick={() => setDeleting(null)}>Cancel</button><button type="button" className="button danger" disabled={saving} onClick={remove}>{saving ? "Deleting..." : "Delete template"}</button></div></div></div></div>}
  </div>;
}
