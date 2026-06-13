// Flag rendering helpers. Primary source is flagcdn.com SVGs (consistent
// everywhere, incl. gb-eng / gb-sct for England & Scotland). Emoji is the
// fallback if an image fails to load.

export function flagUrl(flagCode, size = 'w40') {
  if (!flagCode) return ''
  // flagcdn pattern: https://flagcdn.com/w40/<code>.png  (also serves /<code>.svg)
  return `https://flagcdn.com/${flagCode}.svg`
}

// Emoji fallback. Regional-indicator pair for ISO-2; special tag sequences for
// the UK constituents.
export function flagEmoji(flagCode) {
  if (!flagCode) return '🏳️'
  if (flagCode === 'gb-eng') return '🏴\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}'
  if (flagCode === 'gb-sct') return '🏴\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}'
  const cc = flagCode.slice(0, 2).toUpperCase()
  if (!/^[A-Z]{2}$/.test(cc)) return '🏳️'
  return String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
}
