import { describe, expect, it } from 'vitest'

import { emptyIngredient, isComplete, moveItem } from './drafts'

describe('isComplete', () => {
  const full = { ingredient_id: 1, measurement_id: 2, preparation_id: 3, amount_numerator: 7, amount_denominator: 2 as const }

  it('accepts a row with both ids and a fractional amount', () => {
    expect(isComplete(full)).toBe(true)
  })

  it('accepts a row without a preparation', () => {
    expect(isComplete({ ...full, preparation_id: null })).toBe(true)
  })

  it.each(['ingredient_id', 'measurement_id'] as const)('rejects a missing %s', (field) => {
    expect(isComplete({ ...full, [field]: null })).toBe(false)
  })

  it('rejects a zero amount', () => {
    expect(isComplete({ ...full, amount_numerator: 0 })).toBe(false)
  })

  it('starts incomplete', () => {
    expect(isComplete(emptyIngredient)).toBe(false)
  })
})

describe('moveItem', () => {
  it('swaps an item with its neighbour', () => {
    expect(moveItem(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c'])
    expect(moveItem(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b'])
  })

  it('leaves the ends where they are', () => {
    expect(moveItem(['a', 'b'], 0, -1)).toEqual(['a', 'b'])
    expect(moveItem(['a', 'b'], 1, 1)).toEqual(['a', 'b'])
  })
})
