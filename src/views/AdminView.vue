<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import Icon from '../components/Icon.vue'
import FlagImg from '../components/FlagImg.vue'
import { useMatchesStore } from '../stores/matches.js'
import { useLeaguesStore } from '../stores/leagues.js'
import { formatDayDate, formatTime } from '../lib/time.js'
import { matchFinished } from '../lib/scoring.js'
import { routeThirds, THIRD_SLOT_MATCHES } from '../lib/annexC.js'

const ms = useMatchesStore()
const lg = useLeaguesStore()
const route = useRoute()

const SECTIONS = [
  { key: 'results', label: 'Results', icon: 'whistle' },
  { key: 'knockout', label: 'Knockout', icon: 'bracket' },
  { key: 'locks', label: 'Locks', icon: 'lock' },
  { key: 'leagues', label: 'Leagues', icon: 'users' }
]
const section = computed(() => SECTIONS.some((s) => s.key === route.params.section) ? route.params.section : 'results')
const currentSection = computed(() => SECTIONS.find((s) => s.key === section.value) || SECTIONS[0])
const toast = ref('')
let toastT
function notify(m) { toast.value = m; clearTimeout(toastT); toastT = setTimeout(() => (toast.value = ''), 3000) }
async function guard(fn) { try { await fn() } catch (e) { notify(e.message) } }

// ---------- Results ----------
const STAGES = [
  { key: 'group', label: 'Groups' }, { key: 'r32', label: 'R32' }, { key: 'r16', label: 'R16' },
  { key: 'qf', label: 'QF' }, { key: 'sf', label: 'SF' }, { key: 'third_place', label: '3rd' }, { key: 'final', label: 'Final' }
]
const stage = ref('group')
const view = ref('all') // all | remaining | final
const VIEWS = [{ k: 'all', l: 'All' }, { k: 'remaining', l: 'Remaining' }, { k: 'final', l: 'Final' }]
const scores = ref({}) // matchId -> {h,a}
function ensureScore(m) {
  if (!scores.value[m.id]) scores.value[m.id] = { h: m.home_score ?? '', a: m.away_score ?? '' }
  return scores.value[m.id]
}
// Not-yet-recorded (no result) on top, soonest first; finished below.
const stageMatches = computed(() => {
  let rows = ms.matchesByStage[stage.value] || []
  if (view.value === 'remaining') rows = rows.filter((m) => !matchFinished(m))
  else if (view.value === 'final') rows = rows.filter((m) => matchFinished(m))
  return rows.slice().sort((a, b) => {
    const fa = matchFinished(a) ? 1 : 0
    const fb = matchFinished(b) ? 1 : 0
    if (fa !== fb) return fa - fb
    return new Date(a.kickoff_utc) - new Date(b.kickoff_utc)
  })
})
const team = (id) => ms.teamById[id]

// KO advancer (pens/ET): only needed when an entered KO score is level.
const koAdvance = ref({}) // matchId -> teamId
const isKoStage = (m) => m.stage !== 'group'
function isDrawEntered(m) {
  const s = scores.value[m.id]
  return s && s.h !== '' && s.a !== '' && Number(s.h) === Number(s.a)
}
function needsAdvancer(m) {
  return isKoStage(m) && !m.is_third_place_playoff && isDrawEntered(m)
}

async function saveResult(m) {
  const s = scores.value[m.id]
  if (needsAdvancer(m) && !koAdvance.value[m.id]) { notify('Pick who advanced (pens/ET)'); return }
  await guard(async () => {
    await ms.saveResult(m.id, Number(s.h), Number(s.a), needsAdvancer(m) ? koAdvance.value[m.id] : null)
    notify(`#${m.match_no} saved`)
  })
}
const refreshing = ref(false)
const suggestions = ref(null)
async function refresh() {
  refreshing.value = true
  await guard(async () => { suggestions.value = await ms.fetchSuggestions() })
  refreshing.value = false
}
async function applyAll() {
  await guard(async () => {
    for (const s of [...(suggestions.value || [])]) await ms.saveResult(s.match.id, s.home_score, s.away_score)
    suggestions.value = []
    notify('Applied official results')
  })
}

// KO team resolution
const koResolve = ref({}) // matchId -> {home, away}
const editingTeams = ref({}) // matchId -> bool (re-editing an already-resolved fixture)
function setKo(id, side, val) {
  const cur = koResolve.value[id] || {}
  koResolve.value = { ...koResolve.value, [id]: { ...cur, [side]: val ? Number(val) : undefined } }
}
// Open the resolve dropdowns for a fixture whose teams are already set, so a
// wrong matchup (e.g. a mis-routed third) can be corrected.
function startEditTeams(m) {
  koResolve.value = { ...koResolve.value, [m.id]: { home: m.home_team_id, away: m.away_team_id } }
  editingTeams.value = { ...editingTeams.value, [m.id]: true }
}
async function resolveKo(m) {
  const r = koResolve.value[m.id] || {}
  if (!r.home || !r.away) { notify('Pick both teams'); return }
  await guard(async () => {
    await ms.setKoTeams(m.id, r.home, r.away)
    editingTeams.value = { ...editingTeams.value, [m.id]: false }
    notify(`#${m.match_no} teams set`)
  })
}

// ---------- Knockout: best-8 thirds + resolve R32 ----------
// Candidate thirds = the 3rd-placed team of every group, ranked best-first.
const thirdCandidates = computed(() => ms.standings.bestThirds || [])
// Group matches still unplayed (drives the "resolve too early" warning).
const groupsRemaining = computed(() => (ms.matchesByStage.group || []).filter((m) => !matchFinished(m)).length)
// Whether any R32 fixture currently has resolved teams (so Unresolve is offered).
const r32Resolved = computed(() => (ms.matchesByStage.r32 || []).some((m) => m.home_team_id || m.away_team_id))
const koThirds = ref(new Set()) // selected group letters
let koThirdsInit = false
const initKoThirds = () => {
  const override = ms.qualifiedThirdsOverride
  if (override) koThirds.value = new Set(override)
  else koThirds.value = new Set((ms.standings.bestThirds || []).slice(0, 8).map((r) => r.group))
  koThirdsInit = true
}
// Seed the selection once standings are available.
watch(() => ms.standings.bestThirds, (rows) => { if (!koThirdsInit && rows && rows.length) initKoThirds() }, { immediate: true })
function toggleKoThird(g) {
  const s = new Set(koThirds.value)
  if (s.has(g)) s.delete(g)
  else { if (s.size >= 8) { notify('Pick exactly 8 — deselect one first'); return } s.add(g) }
  koThirds.value = s
}
async function saveKoThirds() {
  if (koThirds.value.size !== 8) { notify('Pick exactly 8 thirds'); return }
  await guard(async () => { await ms.setQualifiedThirds([...koThirds.value].sort()); notify('Best thirds saved') })
}
async function resolveR32() {
  if (koThirds.value.size !== 8) { notify('Pick exactly 8 thirds'); return }
  if (!ms.allGroupsComplete) { notify('Finish all group matches first'); return }
  await guard(async () => {
    await ms.setQualifiedThirds([...koThirds.value].sort())
    await ms.resolveR32([...koThirds.value].sort())
    notify('Round of 32 resolved')
  })
}
async function unresolveR32() {
  if (!confirm('Clear all Round-of-32 teams back to placeholders? Player picks are unaffected.')) return
  await guard(async () => { await ms.unresolveR32(); notify('Round of 32 cleared') })
}

// ---------- Locks ----------
async function toggleStage(st, locked) { await guard(() => ms.setStageLock(st, locked)) }
async function togglePre() { await guard(() => ms.setPretournamentLock(!ms.pretournamentLocked)) }
async function toggleAdv() { await guard(() => ms.setAccumulateAdvance(!ms.accumulateAdvance)) }

// ---------- Leagues & members ----------
const allProfiles = ref([])
const addEmail = ref('')
onMounted(() => { lg.loadMine(); guard(async () => { allProfiles.value = await lg.loadAllProfiles() }) })

async function addMember() {
  if (!lg.currentLeagueId || !addEmail.value.trim()) return
  await guard(async () => { await lg.adminAddMember(lg.currentLeagueId, addEmail.value.trim()); addEmail.value = ''; notify('Player added') })
}
async function removeMember(uid) {
  await guard(async () => { await lg.adminRemoveMember(lg.currentLeagueId, uid); notify('Removed from league') })
}
async function softRemove(uid) {
  if (!confirm('Soft-remove this account? Purges all their picks and removes them from every league (login stays).')) return
  await guard(async () => { await lg.adminSoftRemoveAccount(uid); allProfiles.value = await lg.loadAllProfiles(); notify('Account soft-removed') })
}
const renameVal = ref('')
async function renameLeague() {
  if (!lg.currentLeagueId || !renameVal.value.trim()) return
  await guard(async () => { await lg.adminRenameLeague(lg.currentLeagueId, renameVal.value.trim()); renameVal.value = ''; notify('League renamed') })
}
const memberName = (m) => m.profiles?.display_name || m.profiles?.email || m.user_id.slice(0, 8)
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center gap-2">
      <Icon :name="currentSection.icon" :size="22" class="text-brand" />
      <h2 class="font-display text-2xl font-bold">{{ currentSection.label }}</h2>
    </div>

    <!-- ===== RESULTS ===== -->
    <div v-if="section === 'results'" class="space-y-3">
      <div class="card p-3 flex items-center gap-2 flex-wrap">
        <button class="btn-ghost btn-sm" :disabled="refreshing" @click="refresh">
          <Icon name="refresh" :size="14" /> {{ refreshing ? 'Fetching…' : 'Refresh from official' }}
        </button>
        <button v-if="suggestions && suggestions.length" class="btn-brand btn-sm" @click="applyAll">
          Apply all ({{ suggestions.length }})
        </button>
        <span v-else-if="suggestions" class="text-xs text-muted">No new results.</span>
      </div>

      <div class="flex gap-1.5 overflow-x-auto pb-1">
        <button v-for="s in STAGES" :key="s.key" class="btn-ghost btn-sm whitespace-nowrap"
          :class="{ '!bg-accent/20 !text-accent': stage === s.key }" @click="stage = s.key">{{ s.label }}</button>
      </div>
      <div class="inline-flex rounded-xl border border-white/10 bg-white/[0.04] p-0.5">
        <button v-for="v in VIEWS" :key="v.k" class="rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer transition-colors duration-200"
          :class="view === v.k ? 'bg-brand text-brand-ink' : 'text-muted'" @click="view = v.k">{{ v.l }}</button>
      </div>

      <div class="space-y-2">
        <div v-for="m in stageMatches" :key="m.id" class="card-tight p-2.5">
          <div class="flex items-center justify-between text-[11px] text-muted">
            <span>#{{ m.match_no }} · {{ formatDayDate(m.kickoff_utc) }} · {{ formatTime(m.kickoff_utc) }}</span>
            <span v-if="matchFinished(m)" class="chip-done"><Icon name="check" :size="11" /> final</span>
          </div>

          <!-- resolved teams (and not re-editing): score entry -->
          <div v-if="m.home_team_id && m.away_team_id && !editingTeams[m.id]">
            <div class="mt-1.5 flex items-center gap-2">
              <div class="flex min-w-0 flex-1 items-center gap-1.5">
                <FlagImg :code="team(m.home_team_id)?.flag_code" size="w-5" />
                <span class="truncate text-sm">{{ team(m.home_team_id)?.name }}</span>
              </div>
              <input class="score-input" type="number" min="0" v-model="ensureScore(m).h" :aria-label="`${team(m.home_team_id)?.name} score`" />
              <input class="score-input" type="number" min="0" v-model="ensureScore(m).a" :aria-label="`${team(m.away_team_id)?.name} score`" />
              <div class="flex min-w-0 flex-1 items-center justify-end gap-1.5">
                <span class="truncate text-right text-sm">{{ team(m.away_team_id)?.name }}</span>
                <FlagImg :code="team(m.away_team_id)?.flag_code" size="w-5" />
              </div>
              <button class="btn-brand btn-sm" @click="saveResult(m)"><Icon name="check" :size="14" /></button>
            </div>

            <!-- drawn KO: who advanced on pens/ET -->
            <div v-if="needsAdvancer(m)" class="mt-1.5 flex items-center gap-1.5">
              <span class="text-xs text-muted shrink-0">Advanced:</span>
              <button class="btn-ghost btn-sm flex-1" :class="{ '!bg-brand !text-brand-ink': (koAdvance[m.id] ?? m.advancing_team_id) === m.home_team_id }"
                @click="koAdvance = { ...koAdvance, [m.id]: m.home_team_id }">{{ team(m.home_team_id)?.name }}</button>
              <button class="btn-ghost btn-sm flex-1" :class="{ '!bg-brand !text-brand-ink': (koAdvance[m.id] ?? m.advancing_team_id) === m.away_team_id }"
                @click="koAdvance = { ...koAdvance, [m.id]: m.away_team_id }">{{ team(m.away_team_id)?.name }}</button>
            </div>

            <!-- correct a mis-routed / wrong KO matchup -->
            <div v-if="isKoStage(m)" class="mt-1.5">
              <button class="btn-ghost btn-sm text-xs" @click="startEditTeams(m)"><Icon name="pencil" :size="12" /> Edit teams</button>
            </div>
          </div>

          <!-- unresolved KO fixture, or re-editing a resolved one: resolve teams -->
          <div v-else class="mt-1.5 space-y-1.5">
            <div class="text-xs text-muted">{{ m.home_placeholder }} vs {{ m.away_placeholder }} — resolve teams:</div>
            <div class="flex items-center gap-1.5">
              <select class="input !py-1.5 text-sm" :value="koResolve[m.id]?.home || ''" @change="setKo(m.id,'home',$event.target.value)">
                <option value="" disabled>Home…</option>
                <option v-for="t in ms.teams" :key="t.id" :value="t.id">{{ t.name }}</option>
              </select>
              <select class="input !py-1.5 text-sm" :value="koResolve[m.id]?.away || ''" @change="setKo(m.id,'away',$event.target.value)">
                <option value="" disabled>Away…</option>
                <option v-for="t in ms.teams" :key="t.id" :value="t.id">{{ t.name }}</option>
              </select>
              <button class="btn-ghost btn-sm" @click="resolveKo(m)">Set</button>
              <button v-if="editingTeams[m.id]" class="btn-ghost btn-sm" @click="editingTeams = { ...editingTeams, [m.id]: false }">Cancel</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ===== KNOCKOUT (best thirds → resolve R32) ===== -->
    <div v-else-if="section === 'knockout'" class="space-y-3">
      <div class="card p-3 space-y-2">
        <div class="flex items-center justify-between">
          <h3 class="font-bold">Best 8 third-placed teams</h3>
          <span class="chip" :class="koThirds.size === 8 ? 'chip-done' : 'chip-live'">{{ koThirds.size }}/8</span>
        </div>
        <p class="text-xs text-muted">
          Ranked best-first from live standings. The top 8 are preselected — adjust if needed, then
          resolve the Round of 32. Group winners/runners-up and Annexe C third-place routing are filled automatically.
        </p>
        <div v-if="!thirdCandidates.length" class="text-xs text-muted">Standings need finished group matches first.</div>
        <div v-else class="grid grid-cols-2 gap-1 sm:grid-cols-3">
          <button v-for="(r, i) in thirdCandidates" :key="r.teamId"
            class="flex items-center gap-2 rounded-lg border border-white/10 px-2 py-1.5 text-left text-sm"
            :class="koThirds.has(r.group) ? 'qualify font-semibold' : 'bg-surface'"
            @click="toggleKoThird(r.group)">
            <span class="w-3 text-center">{{ koThirds.has(r.group) ? '✓' : '' }}</span>
            <FlagImg :code="team(r.teamId)?.flag_code" size="w-5" />
            <span class="truncate">{{ team(r.teamId)?.name }}</span>
            <span class="ml-auto text-[11px] text-muted">3{{ r.group }} · #{{ i + 1 }}</span>
          </button>
        </div>

        <!-- Resolving early would lock in wrong teams — gate it on group completion. -->
        <div v-if="!ms.allGroupsComplete" class="rounded-lg border border-amber-400/30 bg-amber-400/10 p-2 text-xs text-amber-200">
          ⚠️ Round of 32 can only be resolved once <strong>every group match is finished</strong>.
          {{ groupsRemaining }} group match{{ groupsRemaining === 1 ? '' : 'es' }} still to play.
        </div>

        <div class="flex flex-wrap items-center gap-1.5 pt-1">
          <button class="btn-ghost btn-sm" :disabled="koThirds.size !== 8 || !ms.allGroupsComplete" @click="saveKoThirds">Save thirds</button>
          <button class="btn-brand btn-sm" :disabled="koThirds.size !== 8 || !ms.allGroupsComplete" @click="resolveR32">Resolve R32 teams</button>
          <button v-if="r32Resolved" class="btn-danger btn-sm" @click="unresolveR32">Unresolve R32</button>
        </div>
        <p v-if="r32Resolved" class="text-[11px] text-muted">Unresolve clears the R32 teams back to placeholders (e.g. if resolved too early).</p>
      </div>
    </div>

    <!-- ===== LOCKS ===== -->
    <div v-else-if="section === 'locks'" class="space-y-3">
      <div class="card p-3 flex items-center justify-between">
        <div>
          <div class="font-semibold">Pre-tournament bracket</div>
          <div class="text-xs text-muted">Group orders, thirds, knockout & champion picks.</div>
        </div>
        <button class="btn-ghost btn-sm" @click="togglePre">
          <Icon :name="ms.pretournamentLocked ? 'unlock' : 'lock'" :size="14" />
          {{ ms.pretournamentLocked ? 'Unlock' : 'Lock' }}
        </button>
      </div>
      <div class="card p-3 flex items-center justify-between">
        <div>
          <div class="font-semibold">Count advance points</div>
          <div class="text-xs text-muted">Add advancers / thirds / reach points into player totals (e.g. after the tournament). Off = shown only.</div>
        </div>
        <button class="btn-ghost btn-sm" @click="toggleAdv">
          <Icon :name="ms.accumulateAdvance ? 'check' : 'plus'" :size="14" />
          {{ ms.accumulateAdvance ? 'Counting' : 'Not counted' }}
        </button>
      </div>
      <div class="card p-3 space-y-2">
        <div class="label">Lock an entire stage</div>
        <div v-for="s in STAGES" :key="s.key" class="flex items-center justify-between border-t border-white/5 pt-2 first:border-0 first:pt-0">
          <span class="text-sm">{{ s.label }}</span>
          <div class="flex gap-1.5">
            <button class="btn-ghost btn-sm" @click="toggleStage(s.key, true)"><Icon name="lock" :size="13" /> Lock</button>
            <button class="btn-ghost btn-sm" @click="toggleStage(s.key, false)"><Icon name="unlock" :size="13" /> Unlock</button>
          </div>
        </div>
        <p class="text-[11px] text-muted">Per-match score predictions also lock automatically at kickoff (server time).</p>
      </div>
    </div>

    <!-- ===== LEAGUES & MEMBERS ===== -->
    <div v-else class="space-y-3">
      <div class="card p-3 space-y-2">
        <div class="label">League ({{ lg.leagues.length }})</div>
        <select class="input" :value="lg.currentLeagueId || ''" @change="lg.setCurrent($event.target.value || null)">
          <option value="" disabled>Select a league…</option>
          <option v-for="l in lg.leagues" :key="l.id" :value="l.id">{{ l.name }} · {{ l.invite_code }}</option>
        </select>
        <div v-if="lg.currentLeagueId" class="flex items-center gap-1.5">
          <input class="input !py-2 text-sm" v-model="renameVal" :placeholder="`Rename “${lg.currentLeague?.name}”…`" />
          <button class="btn-ghost btn-sm" @click="renameLeague"><Icon name="pencil" :size="14" /> Rename</button>
        </div>
      </div>

      <div v-if="lg.currentLeagueId" class="card p-3 space-y-2">
        <div class="flex items-center justify-between">
          <div class="label">Members ({{ lg.members.length }})</div>
        </div>
        <div class="flex items-center gap-1.5">
          <input class="input !py-2 text-sm" v-model="addEmail" type="email" placeholder="Add player by email…" />
          <button class="btn-brand btn-sm" @click="addMember"><Icon name="plus" :size="14" /> Add</button>
        </div>
        <div v-for="m in lg.members" :key="m.user_id" class="flex items-center justify-between border-t border-white/5 pt-2">
          <span class="truncate text-sm">{{ memberName(m) }}</span>
          <button class="btn-danger btn-sm" @click="removeMember(m.user_id)"><Icon name="x" :size="13" /> Remove</button>
        </div>
        <p v-if="!lg.members.length" class="text-xs text-muted">No members.</p>
      </div>

      <div class="card p-3 space-y-2">
        <div class="label">All accounts ({{ allProfiles.length }})</div>
        <p class="text-[11px] text-muted">Soft-remove purges a player's picks and removes them from every league (login stays — true deletion is done in the Supabase dashboard).</p>
        <div v-for="p in allProfiles" :key="p.id" class="flex items-center justify-between border-t border-white/5 pt-2">
          <span class="truncate text-sm">{{ p.display_name }} <span class="text-muted">· {{ p.email }}</span></span>
          <button class="btn-danger btn-sm" @click="softRemove(p.id)"><Icon name="trash" :size="13" /></button>
        </div>
      </div>
    </div>

    <div v-if="toast" class="fixed inset-x-0 bottom-28 z-40 flex justify-center px-4">
      <div class="popover px-4 py-2.5 text-sm">{{ toast }}</div>
    </div>
  </div>
</template>
