import { describe, expect, it } from 'vitest'

import { emptyIngredient, isComplete } from './drafts'

describe('isComplete', () => {
  const full = { ingredient_id: 1, measurement_id: 2, preparation_id: 3, amount: 2 }

  it('accepts a row with all ids and a whole amount', () => {
    expect(isComplete(full)).toBe(true)
  })

  it.each(['ingredient_id', 'measurement_id', 'preparation_id'] as const)('rejects a missing %s', (field) => {
    expect(isComplete({ ...full, [field]: null })).toBe(false)
  })

  it('rejects a fractional amount, which the API cannot store', () => {
    expect(isComplete({ ...full, amount: 0.5 })).toBe(false)
  })

  it('starts incomplete', () => {
    expect(isComplete(emptyIngredient)).toBe(false)
  })
})
