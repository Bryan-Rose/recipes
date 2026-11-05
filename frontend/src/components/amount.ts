import type { RecipeIngredientCreate } from '../api/types'

export type Denominator = NonNullable<RecipeIngredientCreate['amount_denominator']>

/** The fractions an amount can carry, in dropdown order: [numerator, denominator, glyph]. */
export const FRACTIONS: readonly (readonly [number, Denominator, string])[] = [
  [1, 8, '⅛'],
  [1, 4, '¼'],
  [1, 3, '⅓'],
  [3, 8, '⅜'],
  [1, 2, '½'],
  [5, 8, '⅝'],
  [2, 3, '⅔'],
  [3, 4, '¾'],
  [7, 8, '⅞'],
]

/** Splits an improper fraction into its whole part and the index of its FRACTIONS entry (-1 for none). */
export function splitAmount(numerator: number, denominator: number) {
  const remainder = numerator % denominator
  const fraction = FRACTIONS.findIndex(([n, d]) => n * denominator === remainder * d && remainder > 0)
  return { whole: Math.floor(numerator / denominator), fraction }
}

/** 7/2 → "3 ½", 1/2 → "½", 2/1 → "2". */
export function formatAmount(numerator: number, denominator: number) {
  const { whole, fraction } = splitAmount(numerator, denominator)
  if (fraction === -1) return String(whole)
  const glyph = FRACTIONS[fraction][2]
  return whole === 0 ? glyph : `${whole} ${glyph}`
}

/**
 * Scales n/d by factor/base and rounds to the nearest eighth or third, the
 * finest fractions formatAmount can show. A nonzero amount never rounds to 0.
 * `exact` is false when rounding changed the value.
 */
export function scaleAmount(numerator: number, denominator: number, factor: number, base: number) {
  const scaledNumerator = numerator * factor
  const scaledDenominator = denominator * base
  const value = scaledNumerator / scaledDenominator
  const [best] = [8, 3]
    .map((d) => ({ numerator: Math.max(1, Math.round(value * d)), denominator: d }))
    .sort((a, b) => Math.abs(a.numerator / a.denominator - value) - Math.abs(b.numerator / b.denominator - value))
  const exact = best.numerator * scaledDenominator === scaledNumerator * best.denominator
  return { ...best, exact }
}
