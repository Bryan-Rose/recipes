/** 75 → "1 h 15 min", 60 → "1 h", 20 → "20 min", 0 → "0 min". */
export function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${rest} min`
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`
}
