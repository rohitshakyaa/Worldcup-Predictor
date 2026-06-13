// Live group standings + full tiebreaker chain + best-third ranking.
// All computed from FINISHED group matches only.
//
// Group tiebreakers (in order): points, GD, goals, H2H points, H2H GD,
// H2H goals, fair-play (fewer disciplinary pts), FIFA ranking (lower=better,
// NULL=worst), then team name as a deterministic final fallback.
//
// Third-place ranking: points, GD, goals, fair-play, FIFA ranking, name.

import { matchFinished } from './scoring.js'

function blankStat(team) {
  return {
    teamId: team.id, team, mp: 0, w: 0, d: 0, l: 0,
    gf: 0, ga: 0, gd: 0, pts: 0, fair: 0
  }
}

function applyMatch(stat, gf, ga, cards) {
  stat.mp += 1
  stat.gf += gf
  stat.ga += ga
  stat.gd = stat.gf - stat.ga
  stat.fair += cards || 0
  if (gf > ga) { stat.w += 1; stat.pts += 3 }
  else if (gf === ga) { stat.d += 1; stat.pts += 1 }
  else { stat.l += 1 }
}

// fifa ranking: lower number is better; NULL/0 treated as worst (Infinity).
function rank(team) {
  return team.fifa_ranking && team.fifa_ranking > 0 ? team.fifa_ranking : Infinity
}

// Head-to-head mini-table among a subset of teamIds, using only matches
// between those teams. Returns map teamId -> {pts, gd, gf}.
function headToHead(teamIds, matches) {
  const set = new Set(teamIds)
  const mini = {}
  for (const id of teamIds) mini[id] = { pts: 0, gd: 0, gf: 0 }
  for (const m of matches) {
    if (m.stage !== 'group' || !matchFinished(m)) continue
    if (!set.has(m.home_team_id) || !set.has(m.away_team_id)) continue
    const h = mini[m.home_team_id]
    const a = mini[m.away_team_id]
    h.gf += m.home_score; h.gd += m.home_score - m.away_score
    a.gf += m.away_score; a.gd += m.away_score - m.home_score
    if (m.home_score > m.away_score) h.pts += 3
    else if (m.home_score === m.away_score) { h.pts += 1; a.pts += 1 }
    else a.pts += 3
  }
  return mini
}

// Final fallback comparator (after overall pts/gd/gf): H2H within the tied
// cluster, then fair-play, FIFA ranking, name.
function breakTie(rows, matches) {
  const ids = rows.map((r) => r.teamId)
  const h2h = ids.length > 1 ? headToHead(ids, matches) : {}
  return rows.slice().sort((x, y) => {
    if (ids.length > 1) {
      const hx = h2h[x.teamId], hy = h2h[y.teamId]
      if (hy.pts !== hx.pts) return hy.pts - hx.pts
      if (hy.gd !== hx.gd) return hy.gd - hx.gd
      if (hy.gf !== hx.gf) return hy.gf - hx.gf
    }
    if (x.fair !== y.fair) return x.fair - y.fair          // fewer cards better
    if (rank(x.team) !== rank(y.team)) return rank(x.team) - rank(y.team)
    return x.team.name.localeCompare(y.team.name)
  })
}

// Compute ordered standings for one group's stat rows.
function orderGroup(stats, matches) {
  // 1) overall pts, gd, gf
  const sorted = stats.slice().sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts
    if (b.gd !== a.gd) return b.gd - a.gd
    if (b.gf !== a.gf) return b.gf - a.gf
    return 0
  })
  // 2) break clusters tied on (pts,gd,gf)
  const out = []
  let i = 0
  while (i < sorted.length) {
    let j = i + 1
    while (
      j < sorted.length &&
      sorted[j].pts === sorted[i].pts &&
      sorted[j].gd === sorted[i].gd &&
      sorted[j].gf === sorted[i].gf
    ) j++
    const cluster = sorted.slice(i, j)
    out.push(...(cluster.length > 1 ? breakTie(cluster, matches) : cluster))
    i = j
  }
  return out.map((r, idx) => ({ ...r, position: idx + 1 }))
}

// teams: array of team objects. matches: all matches. Returns
// { groups: { A: [rows...], ... }, bestThirds: [rows...], qualifiedThirdIds:Set }
export function computeStandings(teams, matches) {
  const byGroup = {}
  for (const t of teams) {
    if (!t.group_letter) continue
    ;(byGroup[t.group_letter] ||= {})[t.id] = blankStat(t)
  }
  for (const m of matches) {
    if (m.stage !== 'group' || !matchFinished(m)) continue
    const g = m.group_letter
    if (!byGroup[g]) continue
    applyMatch(byGroup[g][m.home_team_id], m.home_score, m.away_score, m.home_cards)
    applyMatch(byGroup[g][m.away_team_id], m.away_score, m.home_score, m.away_cards)
  }

  const groups = {}
  const thirds = []
  for (const g of Object.keys(byGroup).sort()) {
    const rows = orderGroup(Object.values(byGroup[g]), matches)
    groups[g] = rows
    if (rows[2]) thirds.push({ ...rows[2], group: g })
  }

  // Best 8 third-placed teams.
  const bestThirds = thirds.slice().sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts
    if (b.gd !== a.gd) return b.gd - a.gd
    if (b.gf !== a.gf) return b.gf - a.gf
    if (a.fair !== b.fair) return a.fair - b.fair
    if (rank(a.team) !== rank(b.team)) return rank(a.team) - rank(b.team)
    return a.team.name.localeCompare(b.team.name)
  })
  const qualifiedThirdIds = new Set(bestThirds.slice(0, 8).map((r) => r.teamId))

  return { groups, bestThirds, qualifiedThirdIds }
}

// Actual top-2 (advancing) team ids per group, given computed standings.
export function actualAdvancers(standings) {
  const out = {}
  for (const g of Object.keys(standings.groups)) {
    const rows = standings.groups[g]
    out[g] = new Set([rows[0], rows[1]].filter(Boolean).map((r) => r.teamId))
  }
  return out
}
