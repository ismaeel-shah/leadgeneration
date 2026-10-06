"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { countryOptions } from "@/lib/countries";

type Props = {
  id?: string;
  value: string;
  onChange: (code: string) => void;
  /** Codes shown first (Settings → priority countries). */
  priority?: readonly string[];
};

/** Searchable country picker with flags. Type to filter, arrows to move, Enter to choose. */
export function CountrySelect({ id, value, onChange, priority = [] }: Props) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const options = useMemo(() => countryOptions(priority), [priority]);
  const selected = options.find((option) => option.code === value);
  const term = query.trim().toLowerCase();
  const filtered = term
    ? options.filter((option) => option.name.toLowerCase().includes(term) || option.code.toLowerCase() === term)
    : options;

  const activeCode = filtered[active]?.code;
  useEffect(() => {
    if (open && activeCode) document.getElementById(`${listId}-${activeCode}`)?.scrollIntoView({ block: "nearest" });
  }, [open, activeCode, listId]);

  function choose(code: string) {
    onChange(code);
    setOpen(false);
    setQuery("");
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setActive((index) => Math.min(filtered.length - 1, index + 1)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive((index) => Math.max(0, index - 1)); }
    else if (event.key === "Enter" && open) { event.preventDefault(); if (filtered[active]) choose(filtered[active].code); }
    else if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); setQuery(""); }
  }

  return (
    <div className="combobox" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) { setOpen(false); setQuery(""); } }}>
      <div className="combobox-control" onMouseDown={(event) => { if (event.target !== inputRef.current) { event.preventDefault(); inputRef.current?.focus(); setOpen((value) => !value); } }}>
        {!query && selected && <span className="combobox-value">{selected.flag} {selected.name}</span>}
        <input
          ref={inputRef}
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && filtered[active] ? `${listId}-${filtered[active].code}` : undefined}
          value={query}
          placeholder={selected ? "" : "Search countries"}
          onChange={(event) => { setQuery(event.target.value); setActive(0); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          autoComplete="off"
        />
        <ChevronDown size={15} className="muted" aria-hidden />
      </div>
      {open && (
        <ul className="combobox-list" id={listId} role="listbox">
          {filtered.length === 0 && <li className="combobox-empty">No country matches “{query}”.</li>}
          {filtered.map((option, index) => (
            <li
              key={option.code}
              id={`${listId}-${option.code}`}
              role="option"
              aria-selected={option.code === value}
              className={`${index === active ? "active" : ""} ${index === priority.length - 1 && !term ? "divider" : ""}`}
              onMouseDown={(event) => { event.preventDefault(); choose(option.code); }}
              onMouseEnter={() => setActive(index)}
            >
              <span>{option.flag}</span>{option.name}<span className="muted">{option.code}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
