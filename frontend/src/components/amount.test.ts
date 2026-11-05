import { describe, expect, it } from 'vitest'

import { formatAmount, splitAmount } from './amount'

describe('formatAmount', () => {
  it.each([
    [7, 2, '3 ½'],
    [1, 2, '½'],
    [2, 1, '2'],
    [1, 3, '⅓'],
    [11, 8, '1 ⅜'],
    [15, 4, '3 ¾'],
  ])('%i/%i → %s', (numerator, denominator, expected) => {
    expect(formatAmount(numerator, denominator)).toBe(expected)
  })
})

describe('splitAmount', () => {
  it('finds the whole part and fraction', () => {
    expect(splitAmount(7, 2)).toEqual({ whole: 3, fraction: 4 })
    expect(splitAmount(3, 1)).toEqual({ whole: 3, fraction: -1 })
  })
})
