# LeadFlow

A dashboard for tracking LinkedIn lead generation across several LinkedIn profiles. Open it in the morning and it shows what to do today, from which profile, with which lead.

LeadFlow only **tracks** your work. It never logs in to LinkedIn, sends messages or scrapes anything. You do all of that by hand on LinkedIn and record it here. The full product spec is in [linkedin-leadflow-dashboard-spec.md](linkedin-leadflow-dashboard-spec.md).

**Stack:** Next.js 16 (App Router) · TypeScript · MongoDB Atlas (Mongoose) · Auth.js v5 · Vercel

## Run it locally

You need Node.js 20 or newer and a MongoDB database that runs as a **replica set**. LeadFlow uses transactions, and transactions need a replica set. Atlas clusters, including the free M0 tier, are replica sets already. A plain local `mongod` is not.

```bash
npm install
cp .env.example .env.local   # then fill in the values below
npm run db:indexes           # once, creates the indexes
npm run dev                  # http://localhost:3000
```

1. Open `/signup` and create your account. This needs `ALLOW_SIGNUP=true`.
2. Set `ALLOW_SIGNUP=false` and restart the server, so nobody else can sign up.
3. Run `npm run seed` to add default message templates. If there is more than one account, use `npm run seed -- you@example.com`.
4. In the app, go to **Profiles** and add your LinkedIn profiles. Then go to **Settings** and add your priority countries and your services.

### Environment variables

| Name | Purpose |
|---|---|
| `MONGODB_URI` | Atlas connection string, e.g. `mongodb+srv://user:pass@cluster/leadflow?retryWrites=true&w=majority` |
| `AUTH_SECRET` | Long random string. Generate one with `npx auth secret`. |
| `AUTH_URL` | The site's public URL. Only needed if your Auth.js setup asks for it. |
| `ALLOW_SIGNUP` | `true` only while you create your account(s). Any other value closes sign-up. |

Never commit `.env.local` to git.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm test` | Unit tests plus integration tests. The integration tests use an in-memory MongoDB that is downloaded on the first run. |
| `npm run typecheck` / `npm run lint` | TypeScript and ESLint checks |
| `npm run db:indexes` | Syncs the MongoDB indexes. Run it after deploying a new version that changes models. |
| `npm run seed` | Adds the default templates and fills in any missing settings. Safe to run again. |

## Deploy (MongoDB Atlas + Vercel)

1. **Atlas:**
   - Create a cluster. Put it in the same region as your Vercel functions, e.g. both in Frankfurt or both in Mumbai.
   - Create a database user with read/write access to the `leadflow` database.
   - Under Network Access, allow `0.0.0.0/0`, because Vercel's IP addresses change. As an alternative, install the MongoDB Atlas integration from the Vercel marketplace; it sets this up and adds `MONGODB_URI` for you.
2. **Vercel:**
   - Import the GitHub repository with the Next.js preset.
   - Add the environment variables above.
   - Set the function region to match Atlas, then deploy.
3. **First run:**
   - Sign up.
   - Set `ALLOW_SIGNUP=false` and redeploy.
   - Run `npm run db:indexes` and `npm run seed` from your machine, with `MONGODB_URI` pointing at production.
4. **Backups:** turn on Atlas backups (paid tiers), or schedule a regular `mongodump`.

## How it works

- **The rules engine** is in [lib/rules.ts](lib/rules.ts). One pure function, `applyTransition()`, works out every stage change: the new stage, its dates, the follow-up count and the next action with its due date. Server actions in [actions/leads.ts](actions/leads.ts) save the lead update and its activity together in one transaction. **Undo** (available for 5 seconds) restores the exact fields that changed and deletes the activity.
- **Dates** are stored in UTC. "Today", due dates and report days use the timezone set in Settings, in calendar days ([lib/dates.ts](lib/dates.ts)). For example, a follow-up sent at 11:30 pm Karachi time is due three Karachi days later.
- **Duplicate detection** normalises every LinkedIn URL to `linkedin.com/in/<slug>` ([lib/linkedin-url.ts](lib/linkedin-url.ts)). Duplicates are checked across all of your profiles.
- **Reports** are MongoDB aggregations over the `activities` collection ([queries/reports.ts](queries/reports.ts)).
- **Security:**
  - [proxy.ts](proxy.ts) sends signed-out visitors to `/login`.
  - On top of that, every server action and query checks the session and filters by the signed-in user's id, so guessing another user's ids returns nothing.

## Keyboard shortcuts

| Key | Action |
|---|---|
| `N` / `B` / `C` | Add lead / Bulk add / Log comment |
| `/` or `Ctrl/⌘ K` | Search and command palette |
| `G` then `T` / `P` / `R` | Go to Today / Pipeline / Reports |
| `J` / `K`, `Enter` | Move through rows, open the selected lead |
| `Esc` | Close a panel |
| `?` | Show all shortcuts |

## Where this differs from the spec

- **Styling:** the UI uses a hand-written CSS design system ([app/globals.css](app/globals.css)) built on the spec's colour tokens, not shadcn/ui. The behaviour described in the spec is the same either way.
- **Pipeline table:** sorting and paging run on the server, so the table is a plain `<table>` and doesn't use TanStack Table.
- **Fonts are self-hosted** in [app/fonts](app/fonts) (Figtree, plus the flag glyphs of Noto Color Emoji, both under the SIL Open Font License), so builds never need to reach Google Fonts. Windows has no flag emoji of its own; the flag file is only downloaded when a page shows a flag.
