import { describe, expect, it } from 'vitest'

import type { RecipeDraft } from '../api/types'
import { emptyIngredient, fromImport, isComplete, isFilled, moveItem } from './drafts'

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

describe('fromImport', () => {
  const draft: RecipeDraft = {
    name: 'Soup',
    servings: 0,
    active_cook_time: 15,
    inactive_cook_time: -5,
    notes: '  ',
    ingredients: [
      { amount_numerator: 3, amount_denominator: 2, measurement: 'Cup', ingredient: 'shallot', preparation: ' ' },
    ],
    requirements: ['Pot'],
    steps: ['Simmer.'],
  }
  const lists = { ingredient: [{ id: 1, name: 'onion' }], measurement: [{ id: 2, name: 'cup' }], preparation: [] }

  it('matches names case-insensitively and leaves the rest pending', () => {
    const [row] = fromImport(draft, lists).ingredients
    expect(row).toEqual({
      ingredient_id: null,
      measurement_id: 2,
      preparation_id: null,
      amount_numerator: 3,
      amount_denominator: 2,
      pending: { ingredient: 'shallot' },
    })
    expect(isFilled(row)).toBe(true)
    expect(isComplete(row)).toBe(false)
  })

  it('blanks values the API would reject', () => {
    const { scalars } = fromImport(draft, lists)
    expect(scalars).toMatchObject({ name: 'Soup', servings: null, active_cook_time: 15, inactive_cook_time: null, notes: null })
  })
})

describe('isFilled', () => {
  it('needs an ingredient and a measurement, picked or pending, and an amount', () => {
    expect(isFilled({ ...emptyIngredient, pending: { ingredient: 'leek' } })).toBe(false)
    expect(isFilled({ ...emptyIngredient, measurement_id: 1, pending: { ingredient: 'leek' } })).toBe(true)
    expect(isFilled({ ...emptyIngredient, measurement_id: 1, pending: { ingredient: 'leek' }, amount_numerator: 0 })).toBe(false)
  })
})
