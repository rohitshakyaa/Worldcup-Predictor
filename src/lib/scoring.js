// ============================================================================
// SCORING CONSTANTS — tweak here. Scoring is computed entirely in the browser
// from locked match data + the player's predictions/picks.
// ============================================================================
export const STAGE_PTS = { group: 3, r32: 5, r16: 7, qf: 9, sf: 13, final: 17 }
export const EXACT_BONUS = 2
export const CLOSEST_BONUS = 1
export const ADVANCE_PTS = 5
export const CHAMPION_PTS = 10

// Toggles:
export const SCORE_EXACT_POSITION = false // +1 per exact group-position slot
export const SCORE_KO_REACH = true        // score the bracket reach picks
// Points per team correctly predicted to REACH a knockout round (from the
// connected bracket's advancers). R32 reach for the 8 thirds is THIRD_QUALIFY_PTS.
export const KO_REACH_PTS = { r16: 2, qf: 3, sf: 4, final: 5 }
export const THIRD_QUALIFY_PTS = 3        // each correctly-predicted best-8 third

const POSITION_SLOT_PTS = 1

export function resultOf(h, a) {
  if (h === a) return 'D'
  return h > a ? 'H' : 'A'
}

export function matchFinished(m) {
  return m && m.status === 'finished' && m.home_score != null && m.away_score != null
}

// Score a single prediction against a finished match.
// Returns { base, exact, closest, total }. Third-place playoff scores 0.
export function scorePrediction(pred, match) {
  const zero = { base: 0, exact: 0, closest: 0, total: 0 }
  if (!pred || !matchFinished(match) || match.is_third_place_playoff) return zero

  const stagePts = STAGE_PTS[match.stage] || 0
  const actH = match.home_score
  const actA = match.away_score
  const predH = pred.home_pred
  const predA = pred.away_pred

  // Base: predicted result (W/D/L) matches actual (90-min result as entered).
  const base = resultOf(predH, predA) === resultOf(actH, actA) ? stagePts : 0

  const homeRight = predH === actH
  const awayRight = predA === actA
  let exact = 0
  let closest = 0
  if (homeRight && awayRight) {
    exact = EXACT_BONUS // both correct
  } else if (homeRight || awayRight) {
    closest = CLOSEST_BONUS // exactly one correct (independent of base)
  }

  return { base, exact, closest, total: base + exact + closest }
}

// Advance points: +5 for each team the player put in their group's top-2 that
// actually finished in the real top-2. `actualTop2` = Set of team ids.
export function scoreAdvance(predictedTop2Ids, actualTop2Ids) {
  let pts = 0
  for (const id of predictedTop2Ids) if (actualTop2Ids.has(id)) pts += ADVANCE_PTS
  return pts
}

// Optional exact-position bonus across a full 1..4 ordering.
export function scoreExactPositions(predictedOrder, actualOrder) {
  if (!SCORE_EXACT_POSITION) return 0
  let pts = 0
  for (let i = 0; i < 4; i++) {
    if (predictedOrder[i] != null && predictedOrder[i] === actualOrder[i]) pts += POSITION_SLOT_PTS
  }
  return pts
}

export function scoreChampion(pickTeamId, actualChampionId) {
  return pickTeamId != null && pickTeamId === actualChampionId ? CHAMPION_PTS : 0
}

export function scoreKoReach(round, pickedIds, actualReachedIds) {
  if (!SCORE_KO_REACH) return 0
  const per = KO_REACH_PTS[round] || 0
  let pts = 0
  for (const id of pickedIds) if (actualReachedIds.has(id)) pts += per
  return pts
}

// Each predicted best-8 third that actually qualified.
export function scoreThirds(pickedThirdIds, actualQualifiedThirdIds) {
  if (!SCORE_KO_REACH) return 0
  let pts = 0
  for (const id of pickedThirdIds) if (actualQualifiedThirdIds.has(id)) pts += THIRD_QUALIFY_PTS
  return pts
}
