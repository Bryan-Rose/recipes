import { describe, expect, it } from 'vitest'

import { formatAmount, scaleAmount, splitAmount } from './amount'

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

describe('scaleAmount', () => {
  it.each([
    // [n, d, factor, base, expected, exact]
    [1, 2, 8, 4, '1', true],
    [1, 3, 3, 2, '½', true],
    [2, 3, 6, 4, '1', true],
    [3, 1, 1, 2, '1 ½', true],
    [1, 3, 5, 4, '⅜', false], // 5/12 ≈ 0.417, nearest eighth 3/8 beats nearest third 1/3
    [1, 8, 1, 4, '⅛', false], // 1/32 would round to 0; floor at ⅛
    [1, 1, 3, 4, '¾', true],
  ])('%i/%i × %i/%i → %s', (n, d, factor, base, expected, exact) => {
    const scaled = scaleAmount(n, d, factor, base)
    expect(formatAmount(scaled.numerator, scaled.denominator)).toBe(expected)
    expect(scaled.exact).toBe(exact)
  })
})
