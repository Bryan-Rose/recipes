import { describe, expect, it } from 'vitest'

import type { RecipeDraft } from '../api/types'
import { emptyIngredient, fromImport, groupsOf, isComplete, isFilled, moveItem, toLine } from './drafts'

describe('isComplete', () => {
  const full = {
    ...emptyIngredient,
    ingredient_id: 1,
    measurement_id: 2,
    preparation_id: 3,
    amount_numerator: 7,
    amount_denominator: 2 as const,
  }

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
    author: 'ana roux',
    tags: ['Soup', 'made-up', 'soup'],
    ingredients: [
      {
        amount_numerator: 3,
        amount_denominator: 2,
        measurement: 'Cup',
        ingredient: 'shallot',
        preparation: ' ',
        group: 'Base',
        note: 'about',
      },
    ],
    requirements: ['Pot'],
    steps: ['Simmer.'],
  }
  const lists = {
    ingredient: [{ id: 1, name: 'onion' }],
    measurement: [{ id: 2, name: 'cup' }],
    preparation: [],
    author: [{ id: 4, name: 'Ana Roux' }],
    tag: [
      { id: 6, name: 'soup' },
      { id: 5, name: 'dinner' },
    ],
  }

  it('matches names case-insensitively and leaves the rest pending', () => {
    const [row] = fromImport(draft, lists).ingredients
    expect(row).toEqual({
      ingredient_id: null,
      measurement_id: 2,
      preparation_id: null,
      amount_numerator: 3,
      amount_denominator: 2,
      group: 'Base',
      note: 'about',
      pending: { ingredient: 'shallot' },
    })
    expect(isFilled(row)).toBe(true)
    expect(isComplete(row)).toBe(false)
  })

  it('blanks values the API would reject', () => {
    const { scalars } = fromImport(draft, lists)
    expect(scalars).toMatchObject({ name: 'Soup', servings: null, active_cook_time: 15, inactive_cook_time: null, notes: null })
  })

  it('matches the author and existing tags by name, dropping made-up tags', () => {
    const { scalars, pendingAuthor } = fromImport(draft, lists)
    expect(scalars).toMatchObject({ author_id: 4, tag_ids: [6] })
    expect(pendingAuthor).toBeUndefined()
  })

  it('leaves an unknown author pending, and no author as none', () => {
    expect(fromImport({ ...draft, author: ' Pia Lund ' }, lists)).toMatchObject({ scalars: { author_id: null }, pendingAuthor: 'Pia Lund' })
    expect(fromImport({ ...draft, author: null }, lists)).toMatchObject({ scalars: { author_id: null }, pendingAuthor: undefined })
  })
})

describe('toLine', () => {
  it('trims the group and note, and sends blank as none', () => {
    expect(toLine({ ...emptyIngredient, group: ' Sauce ', note: '  ' })).toMatchObject({ group: 'Sauce', note: null })
  })
})

describe('groupsOf', () => {
  it('lists each group once, in order, skipping blanks', () => {
    expect(groupsOf([{ group: 'Dough' }, { group: null }, { group: ' Dough ' }, { group: ' ' }, { group: 'Filling' }])).toEqual([
      'Dough',
      'Filling',
    ])
  })
})

describe('isFilled', () => {
  it('needs an ingredient and a measurement, picked or pending, and an amount', () => {
    expect(isFilled({ ...emptyIngredient, pending: { ingredient: 'leek' } })).toBe(false)
    expect(isFilled({ ...emptyIngredient, measurement_id: 1, pending: { ingredient: 'leek' } })).toBe(true)
    expect(isFilled({ ...emptyIngredient, measurement_id: 1, pending: { ingredient: 'leek' }, amount_numerator: 0 })).toBe(false)
  })
})
