<script setup>
import {
  STAGE_PTS, EXACT_BONUS, CLOSEST_BONUS, ADVANCE_PTS, CHAMPION_PTS,
  THIRD_QUALIFY_PTS, KO_REACH_PTS, THIRD_PLACE_WIN_PTS, SCORE_KO_REACH, SCORE_EXACT_POSITION
} from '../lib/scoring.js'

const stageRows = [
  ['Group stage', STAGE_PTS.group],
  ['Round of 32', STAGE_PTS.r32],
  ['Round of 16', STAGE_PTS.r16],
  ['Quarter-final', STAGE_PTS.qf],
  ['Semi-final', STAGE_PTS.sf],
  ['Third-place play-off', STAGE_PTS.third_place],
  ['Final', STAGE_PTS.final]
]

// Maximum points from a perfect pre-tournament bracket (WC2026 structure:
// 12 groups → 24 advancers, 8 best thirds, then 16/8/4/2 KO winners reach
// R16/QF/SF/Final). Derived from the scoring constants so it stays in sync.
const advancersMax = 12 * 2 * ADVANCE_PTS
const thirdsMax = SCORE_KO_REACH ? 8 * THIRD_QUALIFY_PTS : 0
const reachMax = SCORE_KO_REACH
  ? 16 * KO_REACH_PTS.r16 + 8 * KO_REACH_PTS.qf + 4 * KO_REACH_PTS.sf + 2 * KO_REACH_PTS.final
  : 0
const championMax = CHAMPION_PTS
const thirdPlaceMax = THIRD_PLACE_WIN_PTS
const bracketRows = [
  ['Group top-2 (24 × +' + ADVANCE_PTS + ')', advancersMax],
  ['Best-8 thirds (8 × +' + THIRD_QUALIFY_PTS + ')', thirdsMax],
  ['Knockout reach (16·' + KO_REACH_PTS.r16 + ' + 8·' + KO_REACH_PTS.qf + ' + 4·' + KO_REACH_PTS.sf + ' + 2·' + KO_REACH_PTS.final + ')', reachMax],
  ['Third-place winner', thirdPlaceMax],
  ['Champion', championMax]
].filter(([, pts]) => pts > 0)
const bracketMaxTotal = advancersMax + thirdsMax + reachMax + thirdPlaceMax + championMax
</script>

<template>
  <div class="space-y-4">
    <div class="card p-3">
      <h2 class="text-lg font-bold">📖 Rules &amp; scoring</h2>
      <p class="text-sm text-muted">How points are earned in this prediction game.</p>
    </div>

    <!-- Match score predictions -->
    <div class="card p-3 space-y-2">
      <h3 class="font-bold">1 · Match predictions</h3>
      <p class="text-sm">Predict the score of any match before it kicks off. You score on the <strong>90-minute result</strong> (the result the admin enters; extra-time/penalties don't count toward scoring).</p>
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-xs text-muted">
            <th class="py-1">Stage</th><th class="py-1 text-right">Correct result (W/D/L)</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="[label, pts] in stageRows" :key="label" class="border-t border-white/10">
            <td class="py-1.5">{{ label }}</td>
            <td class="py-1.5 text-right font-bold tabular-nums">+{{ pts }}</td>
          </tr>
        </tbody>
      </table>
      <ul class="mt-1 space-y-1 text-sm">
        <li>🎯 <strong>+{{ EXACT_BONUS }} exact score</strong> — both teams' goals correct. Stacks on the result points.</li>
        <li>📏 <strong>+{{ CLOSEST_BONUS }} closest</strong> — exactly <em>one</em> team's goals correct (e.g. actual 2–1, you said 2–3 → home 2 ✓). Never given together with the exact bonus, and can score even if you got the result wrong.</li>
      </ul>
      <div class="mt-2 rounded-lg border border-white/10 bg-white/[0.04] p-2.5 text-sm">
        <p class="font-semibold">⚽ Knockout draws &amp; penalties</p>
        <p class="mt-1">A knockout match can finish level after 90 minutes and be decided on penalties/extra time. If you predict a <strong>draw</strong> in a knockout match, you also pick <strong>who advances</strong>.</p>
        <ul class="mt-1 space-y-1">
          <li>✅ Correct draw <strong>+ correct team advances</strong> → <strong>full</strong> round points.</li>
          <li>½ Correct draw <strong>but wrong team advances</strong> → <strong>half</strong> the round points (e.g. R32 2.5, Final 8.5).</li>
          <li>The exact &amp; closest goal bonuses are unaffected. Group games and the third-place play-off never need an advancer.</li>
        </ul>
      </div>
    </div>

    <!-- Pre-tournament bracket -->
    <div class="card p-3 space-y-2">
      <h3 class="font-bold">2 · Pre-tournament bracket</h3>
      <p class="text-sm">Filled once and locked by the admin. Predict each group's finishing order, the knockout bracket, and the champion.</p>
      <ul class="space-y-1 text-sm">
        <li>✅ <strong>+{{ ADVANCE_PTS }}</strong> for each team you place in a group's <strong>top 2</strong> that actually finishes top 2.</li>
        <li>🥉 <strong>+{{ THIRD_QUALIFY_PTS }}</strong> for each team you pick as a <strong>best-8 third</strong> that actually qualifies.</li>
        <li v-if="SCORE_KO_REACH">🏟️ Reach a knockout round (per team that actually gets there):
          <strong>R16 +{{ KO_REACH_PTS.r16 }}</strong> ·
          <strong>QF +{{ KO_REACH_PTS.qf }}</strong> ·
          <strong>SF +{{ KO_REACH_PTS.sf }}</strong> ·
          <strong>Final +{{ KO_REACH_PTS.final }}</strong>.
        </li>
        <li>🥉 <strong>+{{ THIRD_PLACE_WIN_PTS }}</strong> for correctly picking the <strong>third-place play-off winner</strong> (also scored as a normal match prediction).</li>
        <li>🏆 <strong>+{{ CHAMPION_PTS }}</strong> for the correct champion.</li>
        <li v-if="SCORE_EXACT_POSITION">🔢 +1 for each group slot (1–4) predicted in the exact position.</li>
      </ul>

      <div class="mt-2 rounded-lg border border-brand/30 bg-brand/5 p-2.5 text-sm">
        <p class="font-semibold">🧮 Maximum from a perfect bracket</p>
        <table class="mt-1 w-full">
          <tbody>
            <tr v-for="[label, pts] in bracketRows" :key="label" class="border-t border-white/10 first:border-0">
              <td class="py-1">{{ label }}</td>
              <td class="py-1 text-right font-bold tabular-nums">+{{ pts }}</td>
            </tr>
            <tr class="border-t border-white/20">
              <td class="py-1.5 font-bold">Total</td>
              <td class="py-1.5 text-right font-extrabold tabular-nums text-brand">{{ bracketMaxTotal }}</td>
            </tr>
          </tbody>
        </table>
        <p class="mt-1 text-[11px] text-muted">A flawless bracket is worth <strong>{{ bracketMaxTotal }}</strong> points — on top of whatever you score from individual match predictions.</p>
      </div>
    </div>

    <!-- Format -->
    <div class="card p-3 space-y-2">
      <h3 class="font-bold">3 · Tournament format</h3>
      <ul class="space-y-1 text-sm">
        <li>48 teams · 12 groups (A–L) of 4 · 104 matches.</li>
        <li>Group stage: 3 games each. Win 3 pts, draw 1, loss 0.</li>
        <li>Advancing: <strong>top 2 of each group + the 8 best third-placed teams</strong> → Round of 32, then single elimination to the Final.</li>
        <li><strong>Group tiebreakers</strong> (in order): points → goal difference → goals scored → head-to-head points → head-to-head GD → head-to-head goals → fair-play → FIFA ranking.</li>
        <li><strong>Best-third tiebreakers</strong>: points → goal difference → goals scored → fair-play → FIFA ranking.</li>
      </ul>
    </div>

    <!-- Locks & leagues -->
    <div class="card p-3 space-y-2">
      <h3 class="font-bold">4 · Locks &amp; leagues</h3>
      <ul class="space-y-1 text-sm">
        <li>🔒 A match prediction <strong>locks at its kickoff</strong> (checked on the server clock) or when the admin locks it manually — you can't beat the clock.</li>
        <li>🔒 The pre-tournament bracket locks when the <strong>admin</strong> locks it.</li>
        <li>🕒 All dates &amp; times are shown in <strong>Nepal Time (NPT, UTC+5:45)</strong>.</li>
        <li>👥 Leagues are private &amp; isolated — you only see your own league's members, predictions, and leaderboard.</li>
        <li>📊 The leaderboard breaks your total into <strong>Group · Knockout · Advances · Champion</strong>.</li>
      </ul>
    </div>
  </div>
</template>
