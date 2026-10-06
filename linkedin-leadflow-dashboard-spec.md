# LeadFlow — LinkedIn Lead Generation Dashboard

Build specification: what to build, how it should behave, how it should look, and how to ship it.

**Stack:** Next.js (App Router) · TypeScript · MongoDB Atlas · Vercel

---

## 1. The problem this solves

The user is a business developer who generates leads on LinkedIn from several LinkedIn profiles at once. His daily routine:

1. Sends 30–40 connection requests per day to relevant people in target countries.
2. When a request is accepted, sends a first message.
3. If the lead replies, continues the conversation (aiming for a call/meeting).
4. If there is no reply after 3 days, sends a follow-up message.
5. Comments on other people's posts to stay visible.

Doing this across multiple profiles, he loses track of who accepted, who is due for a follow-up, and which profile did what. The dashboard's job is simple:

> **Open it in the morning and immediately know what to do today, from which profile, with which lead.**

### Principles

- **The dashboard decides "what's next", the user just acts.** Dates, follow-up timing and counts are calculated automatically.
- **Entering data must be faster than forgetting it.** Adding a lead takes seconds; changing a stage takes one click.
- **Tracking only, no automation.** The app never logs into LinkedIn, never sends messages, never scrapes. All LinkedIn actions are done manually by the user. (LinkedIn's terms prohibit automation and scraping; breaking them risks restricting or banning his profiles.)
- **No CSV import.** All data is entered inside the app.

---

## 2. Core concepts

| Concept | Meaning |
|---|---|
| **Profile** | One of the user's LinkedIn accounts (e.g. "Ali – Main", "Ali – UK"). Every lead and comment belongs to a profile. |
| **Lead** | One person a connection request was sent to. The central record. |
| **Stage** | Where a lead currently is in the pipeline. |
| **Next action** | What must be done with a lead and when (e.g. "Send follow-up 1 on 9 Oct"). Calculated automatically from the stage and dates. |
| **Activity** | A timestamped log entry for everything that happens (request sent, accepted, message sent, reply, comment). Reports are built from activities. |
| **Template** | A reusable message (first message, follow-ups) with placeholders like `{{firstName}}`. |

### Pipeline stages

```
request_sent → accepted → messaged → follow_up_1 → follow_up_2 → no_response (closed)
                                  ↘        ↘            ↘
                                   replied → meeting → won / lost
```

| Stage | Label in UI | Entered when |
|---|---|---|
| `request_sent` | Request sent | Lead is added |
| `accepted` | Accepted | User marks the request as accepted |
| `messaged` | Messaged | First message sent |
| `follow_up_1` | Follow-up 1 sent | First follow-up sent |
| `follow_up_2` | Follow-up 2 sent | Second follow-up sent |
| `replied` | Replied | Lead replied (from any previous messaging stage) |
| `meeting` | Meeting booked | A call/meeting is scheduled |
| `won` | Won | Became a client |
| `lost` | Not interested | Lead declined or went cold after talking |
| `no_response` | No response | Max follow-ups sent and still no reply |
| `withdrawn` | Withdrawn | Pending request withdrawn by the user |

---

## 3. Business rules (automatic behaviour)

These rules are the heart of the app. Implement them in one place (`lib/rules.ts`) and call them from every stage-change action so behaviour stays consistent.

All "days" are calendar days in the user's timezone (default `Asia/Karachi`, configurable in Settings). Store all dates in UTC; convert only for display and "today" calculations.

| When this happens | The app does this |
|---|---|
| Lead added | `stage = request_sent`, `requestSentAt = now`. Logs activity `request_sent`. |
| Marked accepted | `acceptedAt = now`. Next action: **Send first message, due today**. |
| First message sent | `firstMessageAt = lastMessageAt = now`. Next action: **Follow-up 1, due now + followUpGapDays (default 3)**. |
| Follow-up sent | `followUpCount += 1`, `lastMessageAt = now`. If `followUpCount < maxFollowUps` (default 2): next follow-up due in 3 days. Otherwise: next action **Close as no response, due in 3 days**. |
| Close-as-no-response becomes due | Shown in Today as "Close or try once more". One click moves it to `no_response`. Never auto-closed silently. |
| Lead replied | `lastReplyAt = now`. Next action: **Reply to lead, due today**. Clears any follow-up schedule. |
| User replies in an active conversation | Next action: **Check for reply, due in 2 days** (soft reminder, shown lower in Today). |
| Meeting booked | User picks the meeting date/time. Next action: **Meeting**, due at that time. |
| Won / Lost / No response / Withdrawn | Lead is closed. No next action. Hidden from Today. |
| Request pending longer than 21 days | Shown in a "Stale requests" section, suggesting withdrawal (keeps the profile's pending-invitation count healthy). |

**Undo:** every stage change shows a toast with an **Undo** button (5 seconds). Undo restores the previous stage, dates and next action, and deletes the activity entry.

**Duplicates:** LinkedIn URLs are normalised (lowercase, strip query string, trailing slash, `www.`, and locale prefixes) to a canonical `linkedin.com/in/<slug>`. If a lead with the same URL already exists — in any profile — show a warning with a link to the existing lead before saving. Saving anyway is allowed but must be deliberate.

**Daily targets:** each profile has a daily connection target (default 35) and daily comment target (default 10). Progress is counted from today's activities.

**Weekly limit warning:** each profile has a weekly invitation limit (default 100, editable). When requests sent in the last 7 days reach 80% of it, show an amber warning on that profile; at 100%, a red warning. This protects profiles from LinkedIn restrictions.

---

## 4. Features and pages

### 4.1 Today (home page, `/`)

The single most important screen. It answers "what do I do now?" in priority order.

**Header strip**
- Greeting with today's date.
- One compact progress row per active profile: connection requests sent today vs. target (e.g. `Ali – Main 12/35`), comments today vs. target, and the weekly-limit indicator.

**Action queue** (sections, in this order; each shows a count and collapses when empty):

1. **Reply now** — leads in `replied` whose next action is due. Highest priority.
2. **Meetings today** — meetings scheduled today.
3. **Follow-ups due** — overdue items first (with "2 days overdue" in red), then due today.
4. **Send first message** — accepted leads not yet messaged.
5. **Close or retry** — leads whose final follow-up got no response.
6. **Check on conversations** — soft reminders.
7. **Stale requests** — pending > 21 days.

Each row shows: avatar initials, name, role · company, country flag, profile badge (colour-coded), stage, how long ago the last event happened, and **action buttons right on the row**:

- First message row: `Copy message` (fills the right template), `Open LinkedIn`, `Mark sent`.
- Follow-up row: `Copy follow-up`, `Open LinkedIn`, `Mark sent`, `Mark replied`.
- Reply row: `Open LinkedIn`, `Replied to them`, `Book meeting`, `Not interested`.

**Filters:** profile switcher (All / single profile) at the top. Selecting a profile filters the whole page, so he can "work as" one profile at a time.

**Empty state:** "You're all caught up. Send today's connection requests to keep the pipeline full." with a `Add leads` button.

### 4.2 Quick add (global)

Available everywhere via a `Add lead` button in the top bar and the `N` keyboard shortcut. Opens a slide-over panel.

**Single mode**
- LinkedIn URL (required, focused automatically). Name is pre-filled from the URL slug (e.g. `ahmed-khan-12ab` → "Ahmed Khan") and editable.
- Profile (dropdown; remembers the last used one).
- Country (searchable dropdown with flags; remembers the last used one).
- Service / campaign (optional dropdown, from Settings).
- Role, company (optional).
- `Save` and `Save & add another` (keeps profile/country, clears the rest, refocuses URL).

**Bulk mode**
- Textarea: paste many LinkedIn URLs, one per line.
- Choose profile, country and service once for the whole batch.
- Preview table shows parsed names, flags duplicates and invalid URLs before saving.
- `Add 32 leads` creates them all with `stage = request_sent`.

Goal: logging the day's 30–40 requests takes under 5 minutes.

### 4.3 Pipeline (`/leads`)

Two views, toggled at the top, sharing the same filters.

**Board view (Kanban)**
- Columns for open stages: Request sent → Accepted → Messaged → Follow-up 1 → Follow-up 2 → Replied → Meeting.
- Cards: name, company, country flag, profile badge, days in stage.
- Drag a card to another column to change stage (rules from section 3 still apply; illegal jumps show a short explanation).
- Closed stages (Won, Lost, No response, Withdrawn) are in a collapsible "Closed" area.

**Table view**
- Columns: Name, Profile, Country, Service, Stage, Next action (with due date), Last activity, Added.
- Sortable, paginated (50 per page, server-side), row selection.
- Bulk actions on selected rows: change stage, change profile, add tag, delete.

**Filters (both views):** search (name, company, URL), profile, country, service, stage, tag, date added range, "has overdue action". Filters are stored in the URL query string so views can be bookmarked.

### 4.4 Lead detail (side panel, `/leads/[id]`)

Clicking any lead anywhere opens a right-side panel (full page on mobile).

- Header: name, headline, company, country, profile badge, `Open LinkedIn` button, stage dropdown.
- **Next action card** at the top: what's due and when, with the matching action buttons.
- Fields: role, company, country, service, tags, email/phone (optional, if shared in chat), deal value (optional).
- **Notes**: free text, autosaves.
- **Timeline**: every activity in reverse order ("Follow-up 1 sent · 7 Oct, 11:20 from Ali – UK").
- Actions: edit, move to another profile, delete (with confirmation).

### 4.5 Profiles (`/profiles`)

One card per LinkedIn profile:
- Name, LinkedIn URL, colour (used for its badge everywhere), active toggle.
- Settings: daily connection target, daily comment target, weekly invitation limit.
- Stats (last 30 days): requests sent, acceptance rate, reply rate, meetings, pending requests count, weekly-limit meter.
- `Add profile` opens a small form. Profiles with data are deactivated, not deleted.

### 4.6 Templates (`/templates`)

- List grouped by type: Connection note, First message, Follow-up 1, Follow-up 2, Other.
- Each template: name, type, optional country and service (for matching), body.
- Placeholders: `{{firstName}}`, `{{fullName}}`, `{{company}}`, `{{role}}`, `{{country}}`, `{{service}}`, `{{myName}}` (from the profile).
- Live preview with a sample lead while editing; character counter (LinkedIn connection notes are limited, so show a warning above 300 characters for that type).
- **Matching logic for `Copy message`:** pick the template of the right type whose country and service both match the lead; else one matching service only; else one matching country only; else the default for that type. If several match, show a small picker.
- Copying shows a toast "Message copied" and does not change the stage; the user clicks `Mark sent` after actually sending.

### 4.7 Comments (`/comments`)

For tracking engagement on other people's posts.

- Quick log form: profile, post URL, post author name (optional), note (optional). Date defaults to now.
- List grouped by day, filterable by profile.
- Today's progress per profile against the comment target (also shown on Today).
- Optional link to an existing lead if the post author is a lead (shows up in that lead's timeline).

### 4.8 Reports (`/reports`)

Date range picker (presets: This week, Last 7 days, This month, Last 30 days, custom) and profile filter.

- **Funnel:** Requests → Accepted → Messaged → Replied → Meetings → Won, with conversion % between each step.
- **Activity over time:** daily bar chart of requests sent, with accepted and replies as lines.
- **By profile:** table with requests, acceptance %, reply %, meetings per profile.
- **By country:** same metrics per country, sorted by reply rate, so the user sees which markets respond.
- **Follow-up effectiveness:** how many replies came after the first message vs. follow-up 1 vs. follow-up 2.

All numbers are computed from the `activities` collection with MongoDB aggregation pipelines.

### 4.9 Settings (`/settings`)

- Timezone (default `Asia/Karachi`).
- Follow-up gap in days (default 3), max follow-ups (default 2), stale request threshold (default 21).
- Countries list (which countries appear first in dropdowns).
- Services / campaigns list.
- Tags list.
- Account: name, email, password change.

### 4.10 Global search and command palette

`Ctrl/⌘ + K` opens a command palette:
- Search leads by name, company or URL.
- Jump to pages.
- Commands: "Add lead", "Bulk add", "Log comment", "Switch profile to …".

---

## 5. UI and UX design

The goal is a calm, fast, professional tool someone uses for hours every day. Information density is good; noise is not.

### 5.1 Visual direction

A cool, quiet workspace where colour is reserved for meaning: stage, urgency and profile identity. Nothing is coloured for decoration. The one memorable element is the **Today queue**: a single focused column of actionable rows with inline buttons, so the user can work top to bottom without opening anything.

### 5.2 Colour tokens

Define these as CSS variables (Tailwind theme) with light and dark values.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#F5F7FA` | `#0F141B` | Page background |
| `--surface` | `#FFFFFF` | `#161C25` | Panels, cards, tables |
| `--surface-muted` | `#EEF1F5` | `#1D2430` | Hover rows, inputs |
| `--border` | `#DDE2E9` | `#2A3341` | Hairlines |
| `--text` | `#1A2230` | `#E6EAF0` | Primary text |
| `--text-muted` | `#5E6878` | `#98A2B3` | Secondary text |
| `--primary` | `#1F5C99` | `#6FA8E0` | Primary buttons, links, focus ring |
| `--success` | `#1F7A55` | `#4CC38A` | Replied, won, targets met |
| `--warning` | `#A86410` | `#F0B35A` | Due today, approaching limits |
| `--danger` | `#B3362F` | `#F07A72` | Overdue, limit reached, delete |

**Stage colours** (soft background + darker text from the same hue): Request sent = slate, Accepted = blue, Messaged = indigo, Follow-ups = violet, Replied = green, Meeting = teal, Won = solid green, Lost/No response = grey, Withdrawn = grey outline.

**Profile colours:** user picks from 8 preset hues; used as a small dot + label badge. Never rely on colour alone: the profile name always appears with the dot.

### 5.3 Typography

- Font: **Figtree** (Google Fonts via `next/font`) for the entire UI. Use tabular numerals (`font-variant-numeric: tabular-nums`) for all counts, dates and tables.
- Scale: 12 (meta), 13 (table/body small), 14 (body, default), 16 (section titles), 20 (page titles), 28 (dashboard numbers).
- Weights: 400 and 600 only. Sentence case everywhere; no all-caps labels.

### 5.4 Layout

```
┌─────────────┬──────────────────────────────────────────────────────┐
│  LeadFlow   │  [All profiles ▾]     🔍 Search (⌘K)    [+ Add lead]  │
│             ├──────────────────────────────────────────────────────┤
│  Today   12 │  Tuesday, 6 October                                  │
│  Pipeline   │  Ali – Main  ▓▓▓▓░░░ 12/35   💬 4/10   Week 62/100     │
│  Comments   │  Ali – UK    ▓▓░░░░░  6/35   💬 2/10   Week 88/100 ⚠  │
│  Templates  │                                                      │
│  Reports    │  Reply now (3)                                       │
│  Profiles   │  ┌──────────────────────────────────────────────────┐ │
│             │  │ AK  Ahmed Khan · CTO, Nexa  🇦🇪  ● Main  2h ago │ │
│             │  │                [Open LinkedIn] [Replied] [Meeting]│ │
│             │  └──────────────────────────────────────────────────┘ │
│  ─────────  │  Follow-ups due (8)                                  │
│  Settings   │  ...                                                 │
└─────────────┴──────────────────────────────────────────────────────┘
```

- Left sidebar (240px, collapsible to icons). Today shows a badge with the number of due actions.
- Top bar: profile switcher, search, primary `Add lead` button.
- Content max width ~1200px for Today and Reports; Pipeline uses full width.
- Lead details and Quick add open as right-side panels (480px) so the user never loses their place.
- Mobile (< 768px): sidebar becomes a bottom tab bar (Today, Pipeline, Add, Comments, More); panels become full-screen sheets; Today rows stack buttons below the text. The user should be able to process Today's queue from his phone.

### 5.5 Components and interaction details

- Use **shadcn/ui** components (Button, Dialog, Sheet, DropdownMenu, Command, Table, Tabs, Badge, Tooltip, Toast via Sonner, Calendar, Popover) themed with the tokens above.
- Corner radius: 6px for inputs/buttons, 10px for panels. Borders over shadows; only floating elements (menus, panels, toasts) get a shadow.
- Every async action shows immediate optimistic UI (row moves out of the section instantly) and a toast with Undo.
- Loading: skeleton rows matching the real layout, not spinners.
- Empty states always say what to do next and include the action button.
- Errors say what happened and how to fix it ("This LinkedIn URL is already saved under Ali – UK. Open lead").
- Relative times ("3 days ago") with the exact date in a tooltip.
- Motion: only for user-triggered changes (panel slide, row leaving the queue, card drop). Respect `prefers-reduced-motion`.
- Accessibility: visible focus rings, all actions keyboard-reachable, buttons have text labels (icons alone only with tooltips and `aria-label`), WCAG AA contrast in both themes.
- Theme: light, dark, and system (toggle in the user menu).

### 5.6 Keyboard shortcuts

| Key | Action |
|---|---|
| `N` | Add lead |
| `B` | Bulk add |
| `C` | Log comment |
| `/` or `⌘K` | Search / command palette |
| `G then T / P / R` | Go to Today / Pipeline / Reports |
| `J / K` | Move down / up through rows in Today and tables |
| `Enter` | Open selected lead |
| `Esc` | Close panel |

Show a shortcut cheat sheet with `?`.

---

## 6. Tech stack

| Area | Choice | Why |
|---|---|---|
| Framework | Next.js (latest stable, App Router), TypeScript strict | Server components + server actions, first-class on Vercel |
| Styling | Tailwind CSS + shadcn/ui | Fast, consistent, themeable |
| Database | MongoDB Atlas + Mongoose | Flexible documents, aggregation for reports |
| Auth | Auth.js (NextAuth v5) with credentials (email + password, bcrypt) | Simple, works on Vercel; Google login can be added later |
| Validation | Zod (shared between forms and server actions) | One schema, both sides |
| Forms | React Hook Form + Zod resolver | |
| Tables | TanStack Table | Sorting, selection, pagination |
| Drag and drop | dnd-kit | Accessible Kanban |
| Charts | Recharts | Simple, React-friendly |
| Dates | date-fns + date-fns-tz | Timezone-safe "today" and due dates |
| Command palette | cmdk (via shadcn Command) | |
| Toasts | Sonner | Undo support |
| Icons | lucide-react | |

Use server actions for all mutations and server components for data fetching. Client components only where interactivity is needed (board, forms, palette, charts).

---

## 7. Data model (MongoDB collections)

Every document includes `userId` (owner) so multiple users or a small team can be supported later. All queries must filter by `userId` from the session.

### `users`
```ts
{
  _id, name, email (unique), passwordHash,
  settings: {
    timezone: "Asia/Karachi",
    followUpGapDays: 3,
    maxFollowUps: 2,
    staleRequestDays: 21,
    countries: string[],     // ISO codes, shown first in dropdowns
    services: string[],
    tags: string[],
    theme: "system" | "light" | "dark"
  },
  createdAt, updatedAt
}
```

### `profiles`
```ts
{
  _id, userId, name, linkedinUrl, color,          // one of 8 preset keys
  dailyConnectionTarget: 35,
  dailyCommentTarget: 10,
  weeklyInviteLimit: 100,
  isActive: true,
  createdAt, updatedAt
}
```

### `leads`
```ts
{
  _id, userId, profileId,
  fullName, firstName,
  linkedinUrl,              // as entered
  linkedinUrlNormalized,    // canonical, for duplicate checks
  headline?, role?, company?,
  country,                  // ISO code
  service?, tags: string[],
  email?, phone?, dealValue?,
  notes?,

  stage,                    // see section 2
  followUpCount: 0,

  requestSentAt, acceptedAt?, firstMessageAt?,
  lastMessageAt?, lastReplyAt?, meetingAt?, closedAt?,

  nextActionType?,          // "send_first_message" | "follow_up" | "reply"
                            // | "close_or_retry" | "check_conversation" | "meeting"
  nextActionDueAt?,

  createdAt, updatedAt
}
```
Indexes:
- `{ userId: 1, linkedinUrlNormalized: 1 }`
- `{ userId: 1, nextActionDueAt: 1 }` (Today queue)
- `{ userId: 1, stage: 1, profileId: 1 }`
- `{ userId: 1, country: 1 }`
- Text index on `fullName`, `company` for search.

### `activities`
```ts
{
  _id, userId, profileId, leadId?,
  type,   // "request_sent" | "accepted" | "first_message" | "follow_up"
          // | "replied" | "user_replied" | "meeting_booked" | "won" | "lost"
          // | "no_response" | "withdrawn" | "comment" | "note"
  meta?: { followUpNumber?, fromStage?, toStage?, templateId? },
  occurredAt,
  createdAt
}
```
Indexes: `{ userId: 1, occurredAt: -1 }`, `{ userId: 1, profileId: 1, type: 1, occurredAt: -1 }`, `{ leadId: 1, occurredAt: -1 }`.

### `templates`
```ts
{
  _id, userId, name,
  type,   // "connection_note" | "first_message" | "follow_up_1" | "follow_up_2" | "other"
  country?, service?, isDefault: false,
  body,
  createdAt, updatedAt
}
```

### `comments`
```ts
{
  _id, userId, profileId, leadId?,
  postUrl, postAuthorName?, note?,
  commentedAt, createdAt
}
```

---

## 8. Project structure

```
app/
  (auth)/login/page.tsx
  (auth)/signup/page.tsx            // can be disabled after first account
  (app)/layout.tsx                  // sidebar, top bar, providers
  (app)/page.tsx                    // Today
  (app)/leads/page.tsx              // Pipeline (board + table)
  (app)/leads/[id]/page.tsx         // Lead detail (also rendered as panel via intercepting route)
  (app)/@panel/(.)leads/[id]/page.tsx
  (app)/comments/page.tsx
  (app)/templates/page.tsx
  (app)/reports/page.tsx
  (app)/profiles/page.tsx
  (app)/settings/page.tsx
  api/auth/[...nextauth]/route.ts
components/
  ui/                               // shadcn components
  today/ leads/ profiles/ templates/ comments/ reports/ layout/
lib/
  db.ts                             // cached Mongoose connection
  auth.ts                           // Auth.js config
  rules.ts                          // stage transitions & next-action logic
  linkedin-url.ts                   // normalisation + name-from-slug
  templates.ts                      // placeholder filling + matching
  dates.ts                          // timezone-aware helpers
  validations/                      // Zod schemas
models/
  User.ts Profile.ts Lead.ts Activity.ts Template.ts Comment.ts
actions/
  leads.ts profiles.ts templates.ts comments.ts settings.ts
queries/
  today.ts leads.ts reports.ts      // server-side data fetching & aggregations
middleware.ts                       // protect (app) routes
```

### Key implementation notes

**MongoDB connection on Vercel (`lib/db.ts`).** Serverless functions start often, so cache the connection on `globalThis` to avoid opening a new connection per request:

```ts
import mongoose from "mongoose";

const uri = process.env.MONGODB_URI!;
type Cache = { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null };
const g = globalThis as unknown as { _mongoose?: Cache };
const cache: Cache = g._mongoose ?? (g._mongoose = { conn: null, promise: null });

export async function connectDB() {
  if (cache.conn) return cache.conn;
  cache.promise ??= mongoose.connect(uri, { bufferCommands: false, maxPoolSize: 10 });
  cache.conn = await cache.promise;
  return cache.conn;
}
```

**Stage transitions (`lib/rules.ts`).** One pure function computes the new state, which makes it easy to unit-test:

```ts
applyTransition(lead, action, now, settings) => {
  updates: Partial<Lead>,       // stage, dates, followUpCount, nextAction*
  activity: ActivityInput
}
```
Server actions call it, write the lead update and the activity in one MongoDB transaction (or a session), then `revalidatePath` for Today and Pipeline. Undo stores the previous values and reverses both writes.

**Today queue query.** Fetch open leads where `nextActionDueAt <= endOfToday(userTimezone)`, plus stale requests, filtered by profile if selected; group by `nextActionType` on the server; sort overdue first.

**Reports.** Use aggregation on `activities` with `$match` (userId, date range, profile) → `$group` by type (and by day / profile / country via `$lookup` to leads where needed). Convert dates with `$dateToString` using the user's timezone so days line up with what the user sees.

**Security.** Every server action: get session → reject if missing → validate input with Zod → always include `userId` in queries. Never trust IDs from the client without checking ownership.

---

## 9. Environment variables

```
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>/leadflow?retryWrites=true&w=majority
AUTH_SECRET=<generate with: npx auth secret>
AUTH_URL=https://<your-app>.vercel.app      # production only, if required by Auth.js version
ALLOW_SIGNUP=true                            # set false after creating the account(s)
```

Keep `.env.local` out of git.

---

## 10. Deployment (MongoDB Atlas + Vercel)

1. **Atlas:** create a free (M0) or small cluster. Pick a region close to the Vercel function region (e.g. both in Frankfurt/eu-central or both in Mumbai/ap-south) to keep queries fast.
2. **Database user:** create a user with read/write on the `leadflow` database.
3. **Network access:** Vercel uses dynamic IPs, so either allow `0.0.0.0/0` (protected by the strong DB password) or use the official MongoDB Atlas integration in the Vercel marketplace, which sets this up and adds `MONGODB_URI` automatically.
4. **GitHub:** push the project to a repository.
5. **Vercel:** import the repo, framework preset Next.js, add the environment variables from section 9, set the function region to match Atlas, deploy.
6. **First run:** sign up to create the account, then set `ALLOW_SIGNUP=false` and redeploy. A seed script (`npm run seed`) can create default templates and settings.
7. **Indexes:** call `Model.syncIndexes()` from a one-time script (`npm run db:indexes`) rather than on every request.
8. **Backups:** enable Atlas backups (available on paid tiers) or schedule a periodic `mongodump`.

---

## 11. Build plan (milestones)

Each milestone should be usable on its own.

| # | Milestone | Done when |
|---|---|---|
| 1 | Setup: Next.js, Tailwind, shadcn/ui, theme tokens, fonts, DB connection, Auth.js login, app shell (sidebar, top bar, dark mode) | User can log in and see the empty shell, locally and on Vercel |
| 2 | Profiles + Settings | Profiles can be created/edited with targets and colours; settings saved |
| 3 | Leads: models, quick add (single + bulk), URL normalisation, duplicate warning, table view, lead panel | 40 leads can be added in under 5 minutes; duplicates are caught |
| 4 | Rules engine + stage actions + activities + undo | All transitions in section 3 work and are unit-tested |
| 5 | Today page | Queue shows correct sections, counts, overdue states and inline actions; profile filter works |
| 6 | Templates + copy-to-clipboard with matching | Correct template is chosen and filled for any lead |
| 7 | Board view with drag and drop | Dragging updates stage through the same rules |
| 8 | Comments tracker | Comments logged and counted toward daily targets |
| 9 | Reports | Funnel, trends, per-profile and per-country metrics match raw data |
| 10 | Polish: command palette, shortcuts, mobile layout, empty/error states, accessibility pass, performance check | Full daily routine can be done on desktop and phone without confusion |

---

## 12. Testing checklist

- Unit tests for `lib/rules.ts` (every transition, follow-up counting, max follow-ups, undo) and `lib/linkedin-url.ts` (URL variants: with `www`, query strings, trailing slash, mobile links, locale paths).
- Timezone tests: a follow-up marked sent at 11:30 pm Karachi time is due 3 local days later, not 3 UTC days.
- Today queue: overdue, due today, and future items appear in the right places.
- Ownership: a user cannot read or change another user's leads by guessing IDs.
- Report numbers match counts taken directly from the activities collection.
- Mobile: full Today workflow on a 375px-wide screen.

---

## 13. Out of scope (deliberately)

- Any automation of LinkedIn (sending requests/messages, auto-accept detection, scraping, browser extensions that read LinkedIn pages).
- CSV import from LinkedIn data exports.
- Email/SMS outreach.

### Possible later additions

- Team mode: multiple users with roles, assigning leads to teammates.
- Browser notifications or a daily email summary of the Today queue.
- Google login.
- Exporting leads to CSV for the user's own records.
