/** An import's cost in USD; null is a model the backend has no price for. */
export const formatCost = (usd: number | null) => (usd === null ? 'unknown' : `$${usd.toFixed(3)}`)
