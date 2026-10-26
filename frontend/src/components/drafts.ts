/**
 * Form-shaped versions of the API types.
 *
 * These live apart from the components that render them so those files export
 * components only, which is what Vite's fast refresh needs to work properly.
 */

/** The scalar half of a recipe — everything `RecipeUpdate` accepts. */
export interface RecipeScalars {
  name: string
  cookbook_id: number | null
  cookbook_page: number | null
  active_cook_time: string | null
  inactive_cook_time: string | null
  servings: string | null
}

export const emptyScalars: RecipeScalars = {
  name: '',
  cookbook_id: null,
  cookbook_page: null,
  active_cook_time: null,
  inactive_cook_time: null,
  servings: null,
}

/** One ingredient row, mid-edit. Ids are null until something is picked. */
export interface IngredientDraft {
  ingredient_id: number | null
  measurement_id: number | null
  preparation_id: number | null
  amount: number
}

export const emptyIngredient: IngredientDraft = {
  ingredient_id: null,
  measurement_id: null,
  preparation_id: null,
  amount: 1,
}

/** The API requires all three ids, so a row is only submittable once complete. */
export function isComplete(draft: IngredientDraft): boolean {
  return (
    draft.ingredient_id !== null &&
    draft.measurement_id !== null &&
    draft.preparation_id !== null &&
    Number.isInteger(draft.amount)
  )
}
