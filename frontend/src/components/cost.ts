/** An import's cost in USD; null is a model the backend has no price for. */
export const formatCost = (usd: number | null) => (usd === null ? 'unknown' : `$${usd.toFixed(3)}`)

/** How the Import costs and original pages name an import's outcome (when no recipe was saved) and source. */
export const OUTCOME = { draft: 'Not saved', no_draft: 'No recipe found', cut_off: 'Too long' } as const
export const SOURCE = { text: 'Text', photos: 'Photos', url: 'Link' } as const
