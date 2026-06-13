// Official FIFA World Cup 2026 Round-of-32 third-place routing (Annexe C of the
// Regulations for the FIFA World Cup 26™). annexC.json holds all 495 rows,
// extracted + validated from the official FIFA regulations PDF.
//
//   winners: column order ['A','B','D','E','G','I','K','L']
//   matrix:  { "<8 sorted group letters>": [ third-group facing each winner ] }
//
// These 8 group winners are the ones drawn against a third-placed team; each
// maps to a fixed Round-of-32 match number in our schedule:
import annexC from './annexC.json'

export const WINNER_SLOT_MATCH = { A: 79, B: 85, D: 81, E: 74, G: 82, I: 77, K: 87, L: 80 }

// Given the 8 group letters whose third-placed teams qualified, return
// { matchId: sourceGroupLetter } — which group's 3rd fills each slot's away
// side. Returns null if the combination isn't a valid 8-of-12 key.
export function routeThirds(qualifiedGroupLetters) {
  if (!qualifiedGroupLetters || qualifiedGroupLetters.length !== 8) return null
  const key = [...qualifiedGroupLetters].sort().join('')
  const assign = annexC.matrix[key]
  if (!assign) return null
  const out = {}
  annexC.winners.forEach((w, i) => { out[WINNER_SLOT_MATCH[w]] = assign[i] })
  return out
}

export const THIRD_SLOT_MATCHES = Object.values(WINNER_SLOT_MATCH).sort((a, b) => a - b)
