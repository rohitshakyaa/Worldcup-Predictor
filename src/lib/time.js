// All datetimes are stored in UTC. The UI displays EVERY time in Nepal Time
// (Asia/Kathmandu, UTC+5:45) using the NAMED timezone — never offset math —
// so it stays correct regardless of DST rules.

const NPT = 'Asia/Kathmandu'

const dateFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: NPT, day: '2-digit', month: 'short', year: 'numeric'
})
const timeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: NPT, hour: '2-digit', minute: '2-digit', hour12: true
})
const weekdayFmt = new Intl.DateTimeFormat('en-GB', { timeZone: NPT, weekday: 'short' })

function clean(s) {
  // en-GB gives "11 Jun 2026"; we want "Jun 11, 2026"
  const [d, mon, y] = s.split(' ')
  return `${mon} ${parseInt(d, 10)}, ${y}`
}

// "Jun 11, 2026 · 11:45 PM NPT"
export function formatKickoff(utc) {
  if (!utc) return ''
  const dt = new Date(utc)
  const time = timeFmt.format(dt).toUpperCase().replace(/\s/g, ' ')
  return `${clean(dateFmt.format(dt))} · ${time} NPT`
}

export function formatDate(utc) {
  if (!utc) return ''
  return clean(dateFmt.format(new Date(utc)))
}

export function formatTime(utc) {
  if (!utc) return ''
  return `${timeFmt.format(new Date(utc)).toUpperCase()} NPT`
}

export function formatDayDate(utc) {
  if (!utc) return ''
  const dt = new Date(utc)
  return `${weekdayFmt.format(dt)} ${clean(dateFmt.format(dt))}`
}

// Group key for bucketing matches by NPT calendar day (YYYY-MM-DD in NPT).
export function nptDayKey(utc) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: NPT, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date(utc))
  return parts // en-CA => YYYY-MM-DD
}

export function isPast(utc) {
  return Date.now() >= new Date(utc).getTime()
}
