"use client";

import { useEffect, useState } from "react";
import { Command } from "cmdk";
import { ContactRound, MessageCircle, Plus, Search, UserRound } from "lucide-react";
import { searchLeads } from "@/actions/leads";
import type { ProfileDTO } from "@/actions/profiles";
import type { LucideIcon } from "lucide-react";

export type PaletteLink = { href: string; label: string; icon: LucideIcon };

type Props = {
  links: PaletteLink[];
  profiles: ProfileDTO[];
  onClose: () => void;
  onNavigate: (href: string) => void;
  onAdd: (mode: "single" | "bulk") => void;
  onLogComment: () => void;
  onSwitchProfile: (profileId: string) => void;
};

export function CommandPalette({ links, profiles, onClose, onNavigate, onAdd, onLogComment, onSwitchProfile }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; fullName: string; company?: string }[]>([]);
  const [selected, setSelected] = useState("");

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) return;
    let current = true;
    const timer = setTimeout(async () => {
      try {
        const found = await searchLeads(term);
        if (!current) return;
        setResults(found);
        // Leads arrive after the static items; put the best match under the cursor.
        if (found[0]) setSelected(leadValue(found[0].id, query));
      } catch {
        if (current) setResults([]);
      }
    }, 180);
    return () => { current = false; clearTimeout(timer); };
  }, [query]);

  function leadValue(id: string, text: string) {
    return `lead ${id} ${text}`;
  }

  const run = (fn: () => void) => () => { fn(); onClose(); };
  const leads = query.trim().length >= 2 ? results : [];

  return (
    <div className="modal-backdrop palette-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="modal palette" role="dialog" aria-modal="true" aria-label="Search and commands">
        <Command label="Search and commands" loop value={selected} onValueChange={setSelected}>
          <div className="palette-input">
            <Search size={17} className="muted" />
            <Command.Input autoFocus value={query} onValueChange={setQuery} placeholder="Search leads, pages, or commands…" />
            <span className="keyboard-hint">Esc</span>
          </div>
          <Command.List className="palette-list">
            <Command.Empty className="palette-empty">No matches. Try a name, company or LinkedIn URL.</Command.Empty>
            {leads.length > 0 && (
              <Command.Group heading="Leads" forceMount>
                {leads.map((lead) => (
                  <Command.Item key={lead.id} value={leadValue(lead.id, query)} onSelect={run(() => onNavigate(`/leads/${lead.id}`))}>
                    <ContactRound size={16} />
                    <span>{lead.fullName}</span>
                    {lead.company && <span className="muted">{lead.company}</span>}
                  </Command.Item>
                ))}
              </Command.Group>
            )}
            <Command.Group heading="Commands">
              <Command.Item value="add lead new" onSelect={run(() => onAdd("single"))}><Plus size={16} />Add lead<span className="keyboard-hint">N</span></Command.Item>
              <Command.Item value="bulk add leads paste" onSelect={run(() => onAdd("bulk"))}><Plus size={16} />Bulk add<span className="keyboard-hint">B</span></Command.Item>
              <Command.Item value="log comment post" onSelect={run(onLogComment)}><MessageCircle size={16} />Log comment<span className="keyboard-hint">C</span></Command.Item>
              <Command.Item value="switch profile all profiles" onSelect={run(() => onSwitchProfile(""))}><UserRound size={16} />Switch profile to All profiles</Command.Item>
              {profiles.filter((profile) => profile.isActive).map((profile) => (
                <Command.Item key={profile.id} value={`switch profile ${profile.name}`} onSelect={run(() => onSwitchProfile(profile.id))}>
                  <i className={`profile-dot color-${profile.color}`} />Switch profile to {profile.name}
                </Command.Item>
              ))}
            </Command.Group>
            <Command.Group heading="Pages">
              {links.map((link) => (
                <Command.Item key={link.href} value={`go to ${link.label}`} onSelect={run(() => onNavigate(link.href))}>
                  <link.icon size={16} />Go to {link.label}
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
