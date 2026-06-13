// Parses the official results JSON (same shape as wc2026_matches.json) used by
// the admin "Refresh results" button. Matching is by match_no, so no team-name
// normalization is needed.

export function parseResultsFeed(json) {
  const out = {}
  const matches = json && Array.isArray(json.matches) ? json.matches : []
  for (const m of matches) {
    if (m.score && m.score.status === 'finished' && Array.isArray(m.score.ft)) {
      out[m.match_no] = {
        match_no: m.match_no,
        home_score: m.score.ft[0],
        away_score: m.score.ft[1],
        status: 'finished'
      }
    }
  }
  return out // { [match_no]: {home_score, away_score, status} }
}

export async function fetchResults(url) {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Fetch failed (${res.status})`)
  return parseResultsFeed(await res.json())
}
