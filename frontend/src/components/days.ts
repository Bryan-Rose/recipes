/** A local date as YYYY-MM-DD; toISOString would shift it to UTC. */
export const isoDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

export const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)

/** The Monday of the week holding `date`. */
export const monday = (date: Date) => addDays(date, -((date.getDay() + 6) % 7))
