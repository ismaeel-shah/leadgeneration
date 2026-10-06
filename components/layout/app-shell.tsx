"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { toast, Toaster } from "sonner";
import {
  Activity, BarChart3, ChevronDown, ContactRound, LayoutDashboard, LogOut, Menu,
  MessageCircle, Monitor, Moon, Plus, Search, Settings2, Sun, Tags, UsersRound, X,
} from "lucide-react";
import type { ProfileDTO } from "@/actions/profiles";
import { updateSettings } from "@/actions/settings";
import { AddLeadSheet } from "@/components/leads/add-lead-sheet";
import { CommandPalette, type PaletteLink } from "@/components/layout/command-palette";
import type { UserSettings } from "@/models/User";

type Theme = UserSettings["theme"];

const links: PaletteLink[] = [
  { href: "/", label: "Today", icon: LayoutDashboard },
  { href: "/leads", label: "Pipeline", icon: ContactRound },
  { href: "/comments", label: "Comments", icon: MessageCircle },
  { href: "/templates", label: "Templates", icon: Tags },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/profiles", label: "Profiles", icon: UsersRound },
  { href: "/settings", label: "Settings", icon: Settings2 },
];

const shortcuts: [string, string][] = [
  ["N", "Add lead"],
  ["B", "Bulk add"],
  ["C", "Log comment"],
  ["/ or ⌘K", "Search / command palette"],
  ["G then T", "Go to Today"],
  ["G then P", "Go to Pipeline"],
  ["G then R", "Go to Reports"],
  ["J / K", "Move down / up through rows"],
  ["Enter", "Open selected lead"],
  ["Esc", "Close panel"],
  ["?", "Show this cheat sheet"],
];

const themeOptions: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

function applyTheme(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  try { localStorage.setItem("leadflow-theme", theme); } catch { /* storage unavailable */ }
}

/** Moves focus between elements marked `data-nav-row` (Today rows, table rows). */
function moveRowFocus(step: 1 | -1) {
  const rows = [...document.querySelectorAll<HTMLElement>("[data-nav-row]")];
  if (!rows.length) return;
  const current = rows.findIndex((row) => row === document.activeElement);
  const next = current === -1 ? (step === 1 ? 0 : rows.length - 1) : Math.min(rows.length - 1, Math.max(0, current + step));
  rows[next].focus();
  rows[next].scrollIntoView({ block: "nearest" });
}

function isActive(pathname: string, href: string) {
  return pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
}

type Props = {
  children: React.ReactNode;
  userName: string;
  profiles: ProfileDTO[];
  settings: UserSettings;
  todayCount: number;
};

export function AppShell({ children, userName, profiles, settings, todayCount }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [addMode, setAddMode] = useState<"single" | "bulk" | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(settings.theme);
  const selectedProfile = searchParams.get("profile") ?? "";
  const activeProfiles = profiles.filter((profile) => profile.isActive);

  const [savedTheme, setSavedTheme] = useState(settings.theme);
  if (savedTheme !== settings.theme) { setSavedTheme(settings.theme); setTheme(settings.theme); }
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) { setLastPath(pathname); setMoreOpen(false); setAccountOpen(false); }
  useEffect(() => {
    applyTheme(theme);
    if (theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  useEffect(() => {
    function onCustomAdd(event: Event) { setAddMode((event as CustomEvent).detail === "bulk" ? "bulk" : "single"); }
    window.addEventListener("leadflow:add", onCustomAdd);
    return () => window.removeEventListener("leadflow:add", onCustomAdd);
  }, []);

  useEffect(() => {
    let awaitingGo = false;
    let goTimer: ReturnType<typeof setTimeout> | undefined;
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const editable = target?.closest("input,textarea,select,[contenteditable=true]");
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }
      if (event.key === "Escape") {
        setPaletteOpen(false); setAddMode(null); setHelpOpen(false); setMoreOpen(false); setAccountOpen(false);
        return;
      }
      // Don't steal keys while typing or while a dialog owns the keyboard.
      if (editable || event.ctrlKey || event.metaKey || event.altKey) return;
      if (document.querySelector("[aria-modal=true]")) return;
      const key = event.key.toLowerCase();
      if (awaitingGo) {
        awaitingGo = false;
        clearTimeout(goTimer);
        const destinations: Record<string, string> = { t: "/", p: "/leads", r: "/reports" };
        if (destinations[key]) { event.preventDefault(); router.push(destinations[key]); }
        return;
      }
      switch (event.key) {
        case "g": awaitingGo = true; goTimer = setTimeout(() => { awaitingGo = false; }, 800); break;
        case "n": event.preventDefault(); setAddMode("single"); break;
        case "b": event.preventDefault(); setAddMode("bulk"); break;
        case "c": event.preventDefault(); router.push("/comments?log=1"); break;
        case "/": event.preventDefault(); setPaletteOpen(true); break;
        case "?": event.preventDefault(); setHelpOpen(true); break;
        case "j": event.preventDefault(); moveRowFocus(1); break;
        case "k": event.preventDefault(); moveRowFocus(-1); break;
      }
    }
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); clearTimeout(goTimer); };
  }, [router]);

  function changeProfile(profileId: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (profileId) params.set("profile", profileId); else params.delete("profile");
    params.delete("page");
    router.push(`${pathname}${params.size ? `?${params}` : ""}`);
  }

  async function chooseTheme(next: Theme) {
    setTheme(next);
    const result = await updateSettings({ theme: next });
    if (!result.ok) toast.error(result.error);
  }

  const initials = userName.split(/\s+/).map((word) => word[0]).slice(0, 2).join("").toUpperCase();
  const themeMenu = (
    <div className="theme-choice" role="group" aria-label="Theme">
      {themeOptions.map(({ value, label, icon: Icon }) => (
        <button key={value} type="button" aria-pressed={theme === value} className={theme === value ? "active" : ""} onClick={() => chooseTheme(value)}>
          <Icon size={14} />{label}
        </button>
      ))}
    </div>
  );
  const signOutButton = (
    <button type="button" className="button ghost menu-item" onClick={() => signOut({ callbackUrl: "/login" })}>
      <LogOut size={15} /> Sign out
    </button>
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/" className="brand" aria-label="LeadFlow home">
          <span className="brand-mark"><Activity size={20} strokeWidth={2.6} /></span>
          <span className="brand-text">leadflow</span>
        </Link>
        <div className="sidebar-group-label">Workspace</div>
        <nav className="nav-list" aria-label="Main navigation">
          {links.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} title={label} className={`nav-link ${isActive(pathname, href) ? "active" : ""}`} aria-current={isActive(pathname, href) ? "page" : undefined}>
              <Icon size={17} strokeWidth={1.9} />
              <span>{label}</span>
              {href === "/" && todayCount > 0 && <span className="nav-count tabular" aria-label={`${todayCount} actions due`}>{todayCount}</span>}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          {accountOpen && (
            <div className="card account-menu">
              {themeMenu}
              <button type="button" className="button ghost menu-item" onClick={() => setHelpOpen(true)}>Keyboard shortcuts <span className="keyboard-hint">?</span></button>
              {signOutButton}
            </div>
          )}
          <button type="button" className="account-chip" onClick={() => setAccountOpen((open) => !open)} aria-expanded={accountOpen}>
            <span className="account-avatar">{initials || "U"}</span>
            <span className="account-name"><strong>{userName}</strong><span className="muted">Your workspace</span></span>
            <ChevronDown size={14} />
          </button>
        </div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <span className="topbar-title">leadflow</span>
          <select className="input profile-switch" value={selectedProfile} aria-label="Work as profile" onChange={(event) => changeProfile(event.target.value)}>
            <option value="">All profiles</option>
            {activeProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
          </select>
          <div className="topbar-spacer" />
          <button type="button" className="button search-trigger" onClick={() => setPaletteOpen(true)}>
            <Search size={15} /> Search leads and pages <span className="keyboard-hint">⌘ K</span>
          </button>
          <button type="button" className="button icon-only ghost mobile-only" aria-label="Search" onClick={() => setPaletteOpen(true)}><Search size={18} /></button>
          <button type="button" className="button primary topbar-add" onClick={() => setAddMode("single")}>
            <Plus size={16} /> <span className="topbar-add-label">Add lead</span>
          </button>
        </header>
        <main className="content"><div className={`content-inner ${pathname.startsWith("/leads") ? "wide" : ""}`}>{children}</div></main>
      </div>

      <nav className="mobile-tabs" aria-label="Mobile navigation">
        <Link href="/" className={`mobile-tab ${pathname === "/" ? "active" : ""}`}>
          <LayoutDashboard size={19} /><span>Today{todayCount > 0 ? ` ${todayCount}` : ""}</span>
        </Link>
        <Link href="/leads" className={`mobile-tab ${isActive(pathname, "/leads") ? "active" : ""}`}><ContactRound size={19} /><span>Pipeline</span></Link>
        <button type="button" className="mobile-tab" onClick={() => setAddMode("single")}><Plus size={20} /><span>Add</span></button>
        <Link href="/comments" className={`mobile-tab ${isActive(pathname, "/comments") ? "active" : ""}`}><MessageCircle size={19} /><span>Comments</span></Link>
        <button type="button" className={`mobile-tab ${moreOpen ? "active" : ""}`} onClick={() => setMoreOpen(true)} aria-expanded={moreOpen}><Menu size={19} /><span>More</span></button>
      </nav>

      {moreOpen && (
        <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setMoreOpen(false); }}>
          <section className="drawer more-sheet" role="dialog" aria-modal="true" aria-label="More">
            <div className="drawer-header">
              <div><h2>More</h2><p>{userName}</p></div>
              <button type="button" className="button icon-only ghost" onClick={() => setMoreOpen(false)} aria-label="Close"><X size={19} /></button>
            </div>
            <div className="drawer-body form-stack">
              <div className="field">
                <label htmlFor="mobile-profile">Work as profile</label>
                <select id="mobile-profile" value={selectedProfile} onChange={(event) => changeProfile(event.target.value)}>
                  <option value="">All profiles</option>
                  {activeProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
                </select>
              </div>
              <nav className="more-links" aria-label="More pages">
                {links.slice(3).map(({ href, label, icon: Icon }) => (
                  <Link key={href} href={href} className={`nav-link ${isActive(pathname, href) ? "active" : ""}`}><Icon size={17} /><span>{label}</span></Link>
                ))}
              </nav>
              {themeMenu}
              {signOutButton}
            </div>
          </section>
        </div>
      )}

      <AddLeadSheet
        mode={addMode}
        onClose={() => setAddMode(null)}
        profiles={profiles}
        settings={settings}
        onSaved={() => router.refresh()}
      />

      {paletteOpen && (
        <CommandPalette
          links={links}
          profiles={profiles}
          onClose={() => setPaletteOpen(false)}
          onNavigate={(href) => router.push(href)}
          onAdd={setAddMode}
          onLogComment={() => router.push("/comments?log=1")}
          onSwitchProfile={changeProfile}
        />
      )}

      {helpOpen && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setHelpOpen(false); }}>
          <div className="modal" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
            <div className="modal-header">
              <strong>Keyboard shortcuts</strong>
              <button type="button" className="button icon-only ghost" aria-label="Close" onClick={() => setHelpOpen(false)}><X size={17} /></button>
            </div>
            <div className="modal-content shortcut-list">
              {shortcuts.map(([key, label]) => (
                <div key={key}><span>{label}</span><span className="keyboard-hint">{key}</span></div>
              ))}
            </div>
          </div>
        </div>
      )}
      {/* Top centre keeps toasts clear of drawer footers and the sticky save bar. */}
      <Toaster position="top-center" richColors closeButton />
    </div>
  );
}
