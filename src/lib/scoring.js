// ============================================================================
// SCORING CONSTANTS — tweak here. Scoring is computed entirely in the browser
// from locked match data + the player's predictions/picks.
// ============================================================================
export const STAGE_PTS = { group: 3, r32: 5, r16: 7, qf: 9, sf: 13, third_place: 15, final: 17 }
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
export const THIRD_PLACE_WIN_PTS = 7      // correctly picking the 3rd-place play-off winner

// Consolation points for a knockout prediction: the predicted 90'-result TYPE
// is wrong (e.g. you called a draw but it was a decisive win, or you called a
// win but it actually finished level and went to pens/ET) — but the team you
// backed to advance is still the team that actually went through. Smaller
// than the half-credit "correct draw, wrong advancer" case, since you got the
// scoreline shape wrong entirely.
export const WRONG_RESULT_RIGHT_WINNER_PTS = 2

const POSITION_SLOT_PTS = 1

export function resultOf(h, a) {
  if (h === a) return 'D'
  return h > a ? 'H' : 'A'
}

// Knockout stages — a level result here is decided on pens/ET, so the drawn-KO
// advancer rule applies. Includes the third-place play-off.
const KO_STAGES = new Set(['r32', 'r16', 'qf', 'sf', 'third_place', 'final'])

// Render a points value, allowing the .5 produced by the KO-draw rule but
// dropping a trailing .0 (e.g. 5 -> "5", 2.5 -> "2.5").
export function formatPts(n) {
  if (n == null) return '0'
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '')
}

export function matchFinished(m) {
  return m && m.status === 'finished' && m.home_score != null && m.away_score != null
}

// Resolve the team a PREDICTION implies will win:
// - predicted a straight win/loss → implied by which side has the higher score.
// - predicted a draw → only meaningful if they also picked an advancer.
// Exported so the UI can show "who you backed" even for non-draw predictions,
// where there's no explicit advancing_team_id on the pick.
export function predictedWinnerId(pred, match) {
  if (!pred || !match) return null
  const r = resultOf(pred.home_pred, pred.away_pred)
  if (r === 'H') return match.home_team_id
  if (r === 'A') return match.away_team_id
  return pred.advancing_team_id ?? null
}

// Resolve who ACTUALLY won:
// - decisive 90' result → implied by which side scored more.
// - level after 90' → decided on pens/ET, recorded as advancing_team_id.
// Exported so the UI can show the real winner even for matches that didn't
// need penalties (where match.advancing_team_id is never set).
export function actualWinnerId(match) {
  if (!match || !matchFinished(match)) return null
  const { home_score: h, away_score: a } = match
  if (h !== a) return h > a ? match.home_team_id : match.away_team_id
  return match.advancing_team_id ?? null
}

// Score a single prediction against a finished match.
// Returns { base, exact, closest, total }. Scored on the 90-minute result for
// every match, including the third-place play-off.
export function scorePrediction(pred, match) {
  const zero = { base: 0, exact: 0, closest: 0, total: 0 }
  if (!pred || !matchFinished(match)) return zero

  const stagePts = STAGE_PTS[match.stage] || 0
  const actH = match.home_score
  const actA = match.away_score
  const predH = pred.home_pred
  const predA = pred.away_pred

  const predResult = resultOf(predH, predA)
  const actResult = resultOf(actH, actA)
  let base = predResult === actResult ? stagePts : 0

  // KO draw decided on pens/ET: a correct draw earns full points only if the
  // player also nailed who advanced; a wrong/missing advancer earns half.
  const wentToPens = actH === actA && KO_STAGES.has(match.stage) && match.advancing_team_id != null

  if (base && wentToPens) {
    if (pred.advancing_team_id !== match.advancing_team_id) base = stagePts * 0.5
  } else if (!base && KO_STAGES.has(match.stage)) {
    // Wrong 90'-result TYPE in either direction (predicted draw but it was
    // decisive, or predicted decisive but it went to pens/ET) — give partial
    // credit if the team backed to win is still the team that actually won.
    const predWinner = predictedWinnerId(pred, match)
    const actWinner = actualWinnerId(match)
    if (predWinner != null && predWinner === actWinner) base = WRONG_RESULT_RIGHT_WINNER_PTS
  }

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