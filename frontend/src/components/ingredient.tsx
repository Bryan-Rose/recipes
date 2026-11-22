import type { RecipeIngredient, ShoppingLine } from '../api/types'
import { formatAmount, scaleAmount } from './amount'

/** A recipe ingredient, or a shopping list line (which has no preparation). */
type IngredientLine = Omit<ShoppingLine, 'checked'> & { preparation?: RecipeIngredient['preparation'] }

/**
 * "1 ½ cups butter, melted".
 *
 * The "whole" measurement is really an absence and reads badly if printed:
 * it means the ingredient is simply counted. "To taste" has no real amount
 * (the editor still asks for one), so it's never printed or scaled: "salt, to taste".
 * Amounts that no eighth or third matches are rounded and marked ≈.
 */
export function formatIngredient(item: IngredientLine, base: number | null, servings: number | null) {
  const preparation = item.preparation?.name
  if (item.measurement.name.toLowerCase() === 'to taste') {
    return (
      <>
        <span>{item.ingredient.name}</span>
        {preparation && <span className="ingredient-prep">, {preparation}</span>}
        <span className="ingredient-prep">, {item.measurement.name}</span>
      </>
    )
  }
  // Unscaled amounts round too: a shopping list's sums can be any fraction (⅓ + ⅛ is 11/24).
  const scale = base != null && servings != null ? [servings, base] : [1, 1]
  const amount = scaleAmount(item.amount_numerator, item.amount_denominator, scale[0], scale[1])
  const counted = item.measurement.name.toLowerCase() === 'whole'
  const plural = amount.numerator > amount.denominator

  const unit = counted ? '' : `${plural ? pluralize(item.measurement.name) : item.measurement.name} `
  const name = counted && plural ? pluralize(item.ingredient.name) : item.ingredient.name

  return (
    <>
      <span className="ingredient-amount">
        {amount.exact ? '' : <abbr title="rounded">≈</abbr>}
        {formatAmount(amount.numerator, amount.denominator)}
      </span>{' '}
      <span>
        {unit}
        {name}
      </span>
      {preparation && <span className="ingredient-prep">, {preparation}</span>}
    </>
  )
}

function pluralize(word: string) {
  if (word.endsWith('y')) return `${word.slice(0, -1)}ies`
  if (word.endsWith('s') || word.endsWith('h') || word.endsWith('x')) return `${word}es`
  return `${word}s`
}
