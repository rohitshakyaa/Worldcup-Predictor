You are building a static web app I run locally and deploy to GitHub Pages: a FIFA World Cup 2026 prediction game with Supabase as backend. Build the complete file tree. Do NOT deploy, push to git, or call any hosting/upload API — I do that manually. After each major step output ✅ [what was completed]; end with a summary of every file created.

═══════════════════════════════════════
STACK (hard constraints)
═══════════════════════════════════════
- Plain HTML + CSS + vanilla JS only. No framework, no build step, no bundler, no npm.
- Supabase via CDN <script> (@supabase/supabase-js v2).
- Must run by opening index.html via a static server AND work unchanged on GitHub Pages (relative paths only, no server-side code).
- Only the Supabase anon/public key appears in client code, read from config.js. Commit config.example.js placeholder; gitignore config.js. NEVER put the service-role key in the repo.
- TIME DISPLAY: store ALL datetimes in the DB as UTC. Display EVERY match time/date in the UI in Nepal Time (Asia/Kathmandu, UTC+5:45) using Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kathmandu', ...}). Never hardcode +5:45 offset arithmetic — always use the named timezone so it's correct. Show e.g. "Jun 11, 2026 · 11:45 PM NPT".

═══════════════════════════════════════
THE GAME
═══════════════════════════════════════
Prediction competition over the real WC2026. Multiple SEPARATE, ISOLATED leagues — each has its own private leaderboard and members; leagues never see each other's data (enforce via RLS). Players join a league via invite code. One admin enters actual results + manages locks; players self-enter their own predictions.

═══════════════════════════════════════
AUTH & ROLES (Supabase Auth, email/password)
═══════════════════════════════════════
- Players sign up / log in with email + password.
- Admin = a hardcoded ADMIN_EMAIL constant in config.js. Only that account enters/edits actual results and toggles manual locks. Everyone else is a player.
- Players create a league (become owner) or join via invite code.

═══════════════════════════════════════
OFFICIAL WC2026 FORMAT — these are CONFIRMED FACTS, do not invent or alter
═══════════════════════════════════════
- 48 teams, 12 groups (A–L) of 4, hosted by USA/Canada/Mexico. 104 total matches. Opens June 11 2026 (Mexico v South Africa, Estadio Azteca); Final July 19 2026, MetLife Stadium, New Jersey.
- Group stage: 72 matches, June 11–26. Each team plays 3, round-robin. Win 3 pts, draw 1, loss 0.
- Advancement: top 2 of each group (24 teams) + the 8 BEST THIRD-PLACED teams = 32 teams to a brand-new ROUND OF 32.
- Third-place ranking tiebreakers IN ORDER: 1) points, 2) goal difference, 3) goals scored, 4) fair-play/disciplinary points, 5) FIFA ranking.
- Group tiebreakers IN ORDER: 1) points, 2) goal difference, 3) goals scored, 4) head-to-head points, 5) head-to-head GD, 6) head-to-head goals, 7) fair-play, 8) FIFA ranking.
- Knockout path: Round of 32 (16 matches, Jun 28–Jul 1) → Round of 16 (8, Jul 4–6) → Quarterfinals (4, Jul 9–10) → Semifinals (2, Jul 14–15) → Final (Jul 19). Third-place playoff exists (Jul 18) but is NON-SCORING in this game — seed it but exclude from points.
- Round of 32 pairing rule: GROUP WINNERS are seeded against THIRD-PLACED qualifiers; GROUP RUNNERS-UP face each other. Same-group teams cannot meet before the Quarterfinals. The exact third-place→match assignment is one of 495 FIFA-defined scenarios decided only after all 72 group games finish — so seed R32 as placeholders (see exact bracket below) and let admin fill real teams once groups conclude.
- Knockout ties: 30 min extra time, then penalties. For prediction scoring, use the result after 90 min as entered by admin (admin records the advancing side separately if needed); do not try to model penalties in scoring.

CONFIRMED GROUPS (seed exactly, with country flags):
A: Mexico, South Africa, Korea Republic, Czechia
B: Canada, Bosnia & Herzegovina, Qatar, Switzerland
C: Brazil, Morocco, Haiti, Scotland
D: United States, Paraguay, Australia, Turkey
E: Germany, Curaçao, Côte d'Ivoire, Ecuador
F: Netherlands, Japan, Sweden, Tunisia
G: Belgium, Egypt, Iran, New Zealand
H: Spain, Cabo Verde, Saudi Arabia, Uruguay
I: France, Senegal, Iraq, Norway
J: Argentina, Algeria, Austria, Jordan
K: Portugal, DR Congo, Uzbekistan, Colombia
L: England, Croatia, Ghana, Panama

CONFIRMED R32 BRACKET (seed as placeholders; "W"=winner, "RU"=runner-up, "3rd[X/Y/Z]"=best-third from one of those groups):
M73: RU A vs RU B
M74: W E vs 3rd[A/B/C/D/F]
M75: W F vs RU C
M76: W C vs RU F
M77: W I vs 3rd[C/D/F/G/H]
M78: RU E vs RU I
M79: W A vs 3rd[C/E/F/H/I]
M80: W L vs 3rd[E/H/I/J/K]
M81: W D vs 3rd[B/E/F/I/J]
M82: W G vs 3rd[A/E/H/I/J]
M83: RU K vs RU L
M84: W H vs RU J
M85: W B vs 3rd[E/F/G/I/J]
M86: W J vs RU H
M87: W K vs 3rd[D/E/I/J/L]
M88: W G... (use the standard FIFA bracket; if any single pairing is ambiguous from the above, mark it clearly in README as "verify against FIFA regulations" rather than guessing)
Note: there are 16 R32 matches total (M73–M88). Round of 16 = winners of these, then QF/SF/Final follow standard single-elimination. Seed all knockout fixtures as placeholders the admin resolves.

═══════════════════════════════════════
SCORING RULES (compute in browser from locked data)
═══════════════════════════════════════
Base (awarded when predicted RESULT W/D/L matches actual):
Group 3 · R32 5 · R16 7 · QF 9 · SF 13 · Final 17
Bonuses:
- +2 EXACT score (both teams' goals exact). Stacks on base.
- +1 CLOSEST: awarded when the player got EXACTLY ONE team's goal count right (e.g. actual 2–1, predicted 2–3 → home 2 correct → +1). Deterministic, per-player, no cross-player compare. Never awarded together with +2 (exact already means both correct). Can be awarded even if base result is wrong.
Pre-tournament:
- +5 per correct team predicted to ADVANCE from a group (each player picks 2 per group, 24 picks).
- +10 correct CHAMPION.
Leaderboard: per-league, ranked by total, with breakdown (group / knockout / advances / champion).

═══════════════════════════════════════
PRE-PREDICTED BRACKET UI (required)
═══════════════════════════════════════
Before/early in the tournament each player also pre-predicts and these need dedicated UI + scoring:
1. GROUP TABLE POSITIONS: for each group, predict final 1st/2nd/3rd/4th order. Score: +5 per team predicted in the correct advancing pair (matches the "advance" rule above) — and ALSO show their full predicted ordering vs actual side by side. Keep the advance points as the scored component; the full 1-4 ordering is displayed for bragging rights (or add an optional +1 per exact position slot — make this a clearly-labeled toggle constant SCORE_EXACT_POSITION=false by default).
2. KNOCKOUT STAGE PICKS: predict who reaches each knockout round (R32 / R16 / QF / SF / Final / Champion). These are the existing advance + champion mechanics extended; render a bracket-style pre-prediction screen players fill once, that locks at the first group match kickoff. Award the champion +10 here; keep other round-reach predictions DISPLAY-ONLY unless I later enable scoring (constant SCORE_KO_REACH=false default).
Make these pre-predictions LOCK at first-kickoff (same server-side lock mechanism) and visible read-only afterward.

═══════════════════════════════════════
PREDICTION LOCK (enforce SERVER-SIDE — use the approach most suitable for Supabase)
═══════════════════════════════════════
Use the Supabase-idiomatic locking pattern: a SECURITY DEFINER Postgres function (RPC), e.g. save_prediction(match_id, home_pred, away_pred), that the client calls instead of writing the predictions table directly. Inside the function, using SERVER time:
  locked := (manual_lock = true) OR (now() >= kickoff_utc);
  if locked then RAISE EXCEPTION 'Prediction locked for this match'; end if;
Then upsert the prediction. Revoke direct INSERT/UPDATE on predictions from the anon/authenticated role so the ONLY write path is the RPC (this is harder to bypass than an RLS time-policy). Keep an RLS SELECT policy so a member reads only their own league's predictions, and league-isolation policies on all other tables.
- kickoff_utc stored in UTC. Lock = manual_lock OR now() >= kickoff_utc, evaluated in Postgres (never client clock).
- Lock source = BOTH: per-match kickoff_utc seeded from the openfootball feed, AND an admin manual_lock boolean per match/round.
- Same RPC pattern for pre-predictions (group positions, knockout, champion): they lock at the first group match's kickoff.
- UI visually locks fields + shows "Locked"; DB/RPC is source of truth; surface the RPC's exception as a clear inline error if someone tries to beat the clock.

═══════════════════════════════════════
LIVE RESULTS (no upload API; read-only fetch is fine)
═══════════════════════════════════════
- A "Refresh results" button (admin-visible) fetches the openfootball JSON and pre-fills actual scores for finished matches into the admin result fields. Admin reviews and confirms — the fetched value is a SUGGESTION; admin's saved value is authoritative. This is read-only fetch, NOT an upload/deploy API, which is allowed.

═══════════════════════════════════════
SEED THIS EXISTING DATA
═══════════════════════════════════════
Create two seed players (Priyanka, Rohit) in a demo league and seed their GROUP-STAGE predictions below. Map loose names to real teams: Korea→Korea Republic, Cur→Curaçao, Swiss→Switzerland, Ger→Germany, Aus→Australia, Czech→Czechia, Bosnia→Bosnia & Herzegovina. Seed only predictions that map to REAL WC2026 fixtures (both teams in the same group). Any prediction that does NOT map to a real fixture (e.g. a Brazil vs Switzerland line — they're in different groups) must be SKIPPED and LISTED in the README under "Unmatched predictions to reassign." Show home/away exactly as written.

Priyanka:
- Mexico 3–2 South Africa (Group A) ✓
- Korea Republic 4–2 Czechia (Group A) ✓
- Canada 1–0 Bosnia & Herzegovina (Group B) ✓
- USA 2–2 Paraguay (Group D) ✓
- Qatar 1–2 Switzerland (Group B) ✓
- Brazil 1–2 Morocco (Group C) ✓
- Haiti 0–2 Scotland (Group C) ✓
- Australia 1–0 Turkey (Group D) ✓
- Germany 2–0 Curaçao (Group E) ✓
Rohit:
- Mexico 2–0 South Africa (Group A) ✓
- Korea Republic 1–0 Czechia (Group A) ✓
- Canada 2–0 Bosnia & Herzegovina (Group B) ✓
- USA 2–0 Paraguay (Group D) ✓
- Qatar 0–3 Switzerland (Group B) ✓
- Brazil 2–1 Switzerland → UNMATCHED (different groups) → skip + list in README
- Haiti 0–1 Scotland (Group C) ✓
- Australia 0–2 Turkey (Group D) ✓
- Germany 3–0 Curaçao (Group E) ✓

═══════════════════════════════════════
DELIVERABLES (exact file tree)
═══════════════════════════════════════
- index.html — single-page app: auth, league create/join, group tables (live standings MP/W/D/L/GF/GA/GD/Pts, top-2 highlighted, with full group + third-place tiebreaker logic), all match cards by stage with prediction + admin-result inputs, pre-predicted group-position screen, pre-predicted knockout/champion bracket screen, group-advance picks, league leaderboard with breakdown. Flags for all 48 teams.
- style.css — clean, responsive, mobile-friendly.
- app.js — Supabase init, auth, league join/create via invite code, CRUD for predictions/results, live scoring + standings + third-place ranking, lock-state handling, openfootball fetch for times/results, leaderboard render. Scoring constants at top: STAGE_PTS, EXACT_BONUS=2, CLOSEST_BONUS=1, ADVANCE_PTS=5, CHAMPION_PTS=10, SCORE_EXACT_POSITION=false, SCORE_KO_REACH=false.
- config.example.js — { SUPABASE_URL, SUPABASE_ANON_KEY, ADMIN_EMAIL }.
- schema.sql — tables (profiles, leagues, league_members, matches, predictions, group_position_picks, knockout_picks, champion_picks) + FKs + ALL RLS policies incl. league isolation and the kickoff/manual lock enforcement.
- seed.sql — all 12 groups, 48 teams, the 72 group fixtures (use openfootball kickoff times; if a time is unknown use the confirmed date + a placeholder time and list it in README), all knockout placeholders incl. the R32 bracket above, and the Priyanka/Rohit demo league + predictions.
- .gitignore — config.js.
- README.md — ordered setup: (1) create Supabase project, (2) run schema.sql then seed.sql, (3) cp config.example.js config.js and fill URL + anon key + admin email, (4) run locally (python3 -m http.server), (5) deploy to GitHub Pages (push repo → Settings → Pages → deploy from main /root). Explicitly state: committing config.js with ONLY the anon key to a public repo is acceptable because RLS protects the data and the service-role key is never included — so I can decide whether to commit it or keep it gitignored and paste at deploy. Include sections: "Unmatched predictions to reassign" and "Placeholder kickoff times to verify against FIFA."

═══════════════════════════════════════
FORBIDDEN ACTIONS
═══════════════════════════════════════
- Do NOT deploy, push to git, enable Pages, or call any hosting/upload/deploy API.
- Do NOT put the service-role key anywhere in the repo.
- Do NOT add a build step, framework, or npm dependency.
- Do NOT invent kickoff times, group assignments, or R32 pairings beyond the confirmed facts above. If unsure, use a clearly-marked placeholder and list it in the README.

═══════════════════════════════════════
STOP AND ASK BEFORE
═══════════════════════════════════════
- Any data model that lets one league read another league's predictions (isolation is non-negotiable).
- Any step needing real Supabase credentials (use placeholders, tell me what to fill).
- Any R32/knockout pairing you cannot derive from the confirmed bracket (flag it instead of guessing).

Start by laying out the file tree + schema.sql/RLS design, output ✅ as each file completes, and give the final summary at the end.