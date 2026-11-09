/**
 * Form-shaped versions of the API types.
 *
 * These live apart from the components that render them so those files export
 * components only, which is what Vite's fast refresh needs to work properly.
 */

import type { RecipeIngredientCreate } from '../api/types'
import type { Denominator } from './amount'

/** The scalar half of a recipe — everything `RecipeUpdate` accepts. */
export interface RecipeScalars {
  name: string
  cookbook_id: number | null
  cookbook_page: number | null
  active_cook_time: number | null
  inactive_cook_time: number | null
  servings: number | null
  notes: string | null
  source_url: string | null
  /** Sorted, so the edit form's dirty check ignores the order tags were picked in. */
  tag_ids: number[]
}

export const emptyScalars: RecipeScalars = {
  name: '',
  cookbook_id: null,
  cookbook_page: null,
  active_cook_time: null,
  inactive_cook_time: null,
  servings: null,
  notes: null,
  source_url: null,
  tag_ids: [],
}

/**
 * One ingredient row, mid-edit. Ids are null until something is picked;
 * preparation may stay null. The amount is an improper fraction: "3 ½" is 7/2.
 */
export interface IngredientDraft {
  ingredient_id: number | null
  measurement_id: number | null
  preparation_id: number | null
  amount_numerator: number
  amount_denominator: Denominator
}

export const emptyIngredient: IngredientDraft = {
  ingredient_id: null,
  measurement_id: null,
  preparation_id: null,
  amount_numerator: 1,
  amount_denominator: 1,
}

/** Submittable once an ingredient and measurement are picked and the amount is above zero. */
export function isComplete(draft: IngredientDraft): draft is IngredientDraft & RecipeIngredientCreate {
  return (
    draft.ingredient_id !== null &&
    draft.measurement_id !== null &&
    Number.isInteger(draft.amount_numerator) &&
    draft.amount_numerator >= 1
  )
}

/** A copy of `items` with the one at `index` moved one place up (-1) or down (+1). */
export function moveItem<T>(items: T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta
  if (target < 0 || target >= items.length) return items
  const moved = [...items]
  ;[moved[index], moved[target]] = [moved[target], moved[index]]
  return moved
}
