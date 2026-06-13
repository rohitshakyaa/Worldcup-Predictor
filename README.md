# ⚽ World Cup 2026 Predictor

A private-league prediction game for the FIFA World Cup 2026, built as an
installable **Vue 3 + Vite PWA** with a **Supabase** backend. Players join
isolated leagues by invite code, predict match scores and a pre-tournament
bracket, and a single admin enters the real results. Scoring and standings are
computed in the browser. **All match times display in Nepal Time (NPT).**

---

## Stack

- **Vue 3** (`<script setup>` SFCs) + **Pinia** + **Vue Router** (hash mode)
- **Vite** build · **Tailwind v3** (`@apply`) · **vite-plugin-pwa** (installable, offline app shell)
- **Supabase**: Postgres + Auth (email/password) + Row Level Security + SECURITY DEFINER RPCs
- No server code — deployable to GitHub Pages, Netlify, or Vercel.

---

## Setup

### 1. Create a Supabase project
At [supabase.com](https://supabase.com) → New project. Note the **Project URL**
and the **anon/public** API key (Settings → API). **Never** use the service-role key here.

### 2. Run the SQL (in order)
In the Supabase SQL editor, for a **fresh setup** run just these two:
1. **`schema.sql`** — all tables, RLS, lock RPCs, admin RPCs, helper functions (everything).
2. **`seed.sql`** — 12 groups, 48 teams, all 104 fixtures, the already-played results,
   config defaults, and an optional demo league + accounts.

That's it for a brand-new project — **no migration files needed.**

> `seed.sql` is generated from the official `wc2026_matches.json` + `wc2026_fifa_rankings.json`
> by `scripts/gen_seed.mjs` (`npm run gen:seed`). Re-run it if the source files change.

**Starting over on an existing project?** Run **`reset.sql`** first (it drops all app
tables/functions and the demo accounts), then `schema.sql` then `seed.sql`.

**Upgrading an older install?** The `migration_*.sql` files patch a DB that was created
before a feature existed (`migration_admin.sql`, `migration_bracket.sql`,
`migration_save_bracket_pick.sql`, `migration_accumulate_advance.sql`). A fresh
`schema.sql` already includes all of them, so you only need these when upgrading.

After seeding, set the admin email so the database recognises your admin account:
```sql
update public.app_config set value = 'admin@worldcup.com' where key = 'admin_email';
```
This must match `VITE_ADMIN_EMAIL` (below). The client flag only toggles admin
**UI**; the database independently enforces admin writes via `is_admin()`.

### 3. Configure the app
```bash
cp .env.example .env.local
```
Fill in:
```
VITE_SUPABASE_URL=https://<your-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your anon/public key>
VITE_ADMIN_EMAIL=admin@worldcup.com
# VITE_RESULTS_URL=./wc2026_matches.json   # optional override
```

### 4. Run locally
```bash
npm install
npm run dev        # http://localhost:5173
npm run build && npm run preview   # production preview
```

---

## Deploy

The same build is portable to all three hosts (relative `base` + hash routing,
so no SPA-fallback hacks). **You** deploy — this repo never pushes for you.

### GitHub Pages (via the included Action)
1. Push the repo to GitHub.
2. **Settings → Pages → Source = "GitHub Actions"**.
3. **Settings → Secrets and variables → Actions** → add repository secrets:
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_ADMIN_EMAIL`
   (and optionally `VITE_RESULTS_URL`).
4. Push to `main` → `.github/workflows/deploy.yml` builds `dist/` and publishes it.

### Netlify / Vercel
Connect the repo; the included `netlify.toml` / `vercel.json` set the build
command (`npm run build`) and output dir (`dist`). Add the same `VITE_*` env vars
in the host's dashboard.

### About committing the anon key
The anon/public key is **safe to expose** — RLS protects all data and the
service-role key is never in the repo. So you may instead commit a `.env` with
just the anon key (rename `.env.local` → `.env` and un-ignore it) for the
simplest setup. The Secrets-based flow above keeps it out of the repo; either is fine.

---

## How the game works

- **Leagues** are isolated via RLS — members of one league never see another's
  predictions or leaderboard. Join via invite code; create your own to become owner.
- **Predictions** (match scores) and **pre-tournament picks** are written *only*
  through SECURITY DEFINER RPCs that check the lock using **server time**
  (`manual_lock OR now() >= kickoff_utc`). Direct table writes are revoked, so
  the clock can't be beaten client-side; the RPC's "locked" error surfaces inline.
- **Pre-tournament bracket** (group orderings + champion) locks at the **first
  group kickoff**. Top 2 of each predicted group order score **+5** per correct
  advancing team; champion scores **+10**.

### Scoring (`src/lib/scoring.js`)
| Stage | Base (correct W/D/L) |
|------|----|
| Group | 3 |
| Round of 32 | 5 |
| Round of 16 | 7 |
| Quarter-final | 9 |
| Semi-final | 13 |
| Final | 17 |

- **+2** exact score (both teams' goals correct).
- **+1** closest (exactly one team's goals correct; never together with +2; can
  stand even if the result is wrong).
- **+5** per correctly-predicted group advancer · **+10** champion.
- Third-place playoff is seeded but **non-scoring**.
- Toggles (off by default): `SCORE_EXACT_POSITION`, `SCORE_KO_REACH`.

---

## Admin

Sign in as the `VITE_ADMIN_EMAIL` account. On match cards you get **Actual** score
inputs, a per-match **lock** toggle, and on the Matches screen a **↻ Refresh
results** button that fetches the official JSON and proposes scores for finished
matches — you confirm each (or "Apply all"). Knockout fixtures start as
placeholders (`1E`, `2A`, `3A/B/C/D/F`, `W74`, `L101`); resolve their real teams
via the admin RPC once groups conclude.

### Updating results
The "Refresh results" button reads `VITE_RESULTS_URL` (default the bundled
`public/wc2026_matches.json`). To refresh without redeploying, point that var at
a hosted copy of the same JSON shape; or replace `public/wc2026_matches.json` and
redeploy. Whatever the admin saves is authoritative.

---

## Demo data

`seed.sql` includes an optional, clearly-delimited **DEMO DATA** block: an admin,
two players in a "Demo League", and seeded group-stage predictions.

All demo accounts use password **`Worldcup123`**:
- **Admin:** `admin@worldcup.com`
- **Players:** `priyanka@worldcup.com` · `rohit@worldcup.com`
- **Invite code:** `DEMO26`

`admin@worldcup.com` is the admin because it matches `app_config.admin_email`
(seeded) and your `VITE_ADMIN_EMAIL`. Delete the DEMO block before a clean
production seed.

> Note: directly seeding `auth.users` depends on Supabase's auth version. If a
> demo login doesn't work, sign that email up via the app instead — the seeded
> league/predictions attach by the fixed UUID/profile. (Re-running `seed.sql`
> won't change an existing account's password; run `reset.sql` first to reset.)

---

## Unmatched predictions to reassign

These seeded predictions reference teams in **different groups**, so they map to
no real WC2026 fixture and were **skipped** (assign them manually if desired):

- **Rohit — Brazil 2–1 Switzerland** (Brazil = Group C, Switzerland = Group B).

All other seeded predictions mapped to real fixtures.

## Placeholder kickoff times to verify

**None.** Every fixture date/time comes from the official `wc2026_matches.json`
(`kickoff_utc` authoritative). No times were invented or placeheld.

## Knockout pairings

Resolved from the official source — no ambiguity. Notably **M88 = 2D vs 2G**
(Runner-up D vs Runner-up G), and the full R16→Final wiring (`W74 vs W77`, etc.)
is seeded from the same file. Third-place qualifier slots (`3A/B/C/D/F` …) are
FIFA's 495-scenario placeholders, resolved by the admin after the group stage.

---

## File tree

```
index.html  vite.config.js  tailwind.config.js  postcss.config.js
package.json  .env.example  .gitignore
schema.sql  seed.sql  wc2026_matches.json
scripts/gen_seed.mjs
.github/workflows/deploy.yml  netlify.toml  vercel.json
public/  (wc2026_matches.json, icons, favicon)
src/
  main.js  App.vue  style.css  supabase.js
  router/index.js
  stores/{auth,leagues,matches,predictions}.js
  lib/{scoring,standings,time,teams,results}.js
  views/{AuthView,GroupsView,MatchesView,BracketView,MyPicksView,LeaderboardView}.vue
  components/{BottomNav,LeagueBar,FlagImg,MatchCard,GroupTable}.vue
```
