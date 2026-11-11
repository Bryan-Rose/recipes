/**
 * Form-shaped versions of the API types.
 *
 * These live apart from the components that render them so those files export
 * components only, which is what Vite's fast refresh needs to work properly.
 */

import { findByName } from '../api/lookups'
import type { Lookup, RecipeDraft, RecipeIngredientCreate } from '../api/types'
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
  /** Imported names that match no existing row, by field; the row is created when the recipe is saved. */
  pending?: Partial<Record<LookupKind, string>>
}

export type LookupKind = 'ingredient' | 'measurement' | 'preparation'

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

/** Like isComplete, but a pending (to-be-created) ingredient or measurement counts as picked. */
export function isFilled(draft: IngredientDraft): boolean {
  const picked = (id: number | null, pending: string | undefined) => id !== null || Boolean(pending)
  return (
    picked(draft.ingredient_id, draft.pending?.ingredient) &&
    picked(draft.measurement_id, draft.pending?.measurement) &&
    Number.isInteger(draft.amount_numerator) &&
    draft.amount_numerator >= 1
  )
}

/** What CreateRecipeForm starts from. */
export interface RecipeInitial {
  scalars: RecipeScalars
  ingredients: IngredientDraft[]
  requirements: string[]
  steps: string[]
}

/** An imported draft as form state: names matched to existing rows case-insensitively, the rest left pending. */
export function fromImport(draft: RecipeDraft, lists: Record<LookupKind, readonly Lookup[]>): RecipeInitial {
  // The schema only says these are integers, but the API 422s below its minimums (servings 1, times 0); leave it blank instead.
  const atLeast = (min: number, value: number | null) => (value !== null && value >= min ? value : null)
  return {
    scalars: {
      ...emptyScalars,
      name: draft.name,
      servings: atLeast(1, draft.servings),
      active_cook_time: atLeast(0, draft.active_cook_time),
      inactive_cook_time: atLeast(0, draft.inactive_cook_time),
      notes: draft.notes?.trim() || null,
    },
    ingredients: draft.ingredients.map((line) => {
      const pending: Partial<Record<LookupKind, string>> = {}
      const match = (kind: LookupKind, name: string | null) => {
        if (!name?.trim()) return null
        const found = findByName(lists[kind], name)
        if (!found) pending[kind] = name.trim()
        return found?.id ?? null
      }
      return {
        ingredient_id: match('ingredient', line.ingredient),
        measurement_id: match('measurement', line.measurement),
        preparation_id: match('preparation', line.preparation),
        amount_numerator: line.amount_numerator,
        amount_denominator: line.amount_denominator,
        pending,
      }
    }),
    requirements: draft.requirements,
    steps: draft.steps,
  }
}

/** A copy of `items` with the one at `index` moved one place up (-1) or down (+1). */
export function moveItem<T>(items: T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta
  if (target < 0 || target >= items.length) return items
  const moved = [...items]
  ;[moved[index], moved[target]] = [moved[target], moved[index]]
  return moved
}
