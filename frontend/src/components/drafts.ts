/**
 * Form-shaped versions of the API types.
 *
 * These live apart from the components that render them so those files export
 * components only, which is what Vite's fast refresh needs to work properly.
 */

import { findByName } from '../api/lookups'
import type { ImageUpload, Lookup, RecipeDraft, RecipeIngredientCreate } from '../api/types'
import type { Denominator } from './amount'

/** The scalar half of a recipe — everything `RecipeUpdate` accepts. */
export interface RecipeScalars {
  name: string
  cookbook_id: number | null
  cookbook_page: number | null
  /** Only without a cookbook; a cookbook recipe's author is its cookbook's. */
  author_id: number | null
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
  author_id: null,
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
  /** As typed; toLine trims them, and blank is none. */
  group: string | null
  note: string | null
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
  group: null,
  note: null,
}

/** A row's group and note as the API takes them: trimmed, and null when blank (a blank string is a 422). */
export function toLine<T extends IngredientDraft>(draft: T): T {
  return { ...draft, group: draft.group?.trim() || null, note: draft.note?.trim() || null }
}

/** The groups already used by these rows, for the Group field's suggestions. */
export const groupsOf = (rows: readonly { group: string | null }[]) => [
  ...new Set(rows.flatMap((row) => (row.group?.trim() ? [row.group.trim()] : []))),
]

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
  image?: ImageUpload | null
  /** An imported author's name that matches no author; added when the recipe is saved without a cookbook. */
  pendingAuthor?: string
}

/**
 * A name's last word in the singular, by the common English endings: "onions" and "Onion" both give "onion",
 * "tomatoes" "tomato", "berries" "berry", "peaches" "peach". Not a dictionary: it only has to make a plural and its
 * singular meet, and a word that ends in "ss" ("glass") is left alone.
 */
export function singular(name: string): string {
  const word = name.trim().toLowerCase()
  if (word.endsWith('ies') && word.length > 4) return `${word.slice(0, -3)}y`
  if (/(ch|sh|x|z|ss|o)es$/.test(word)) return word.slice(0, -2)
  if (word.endsWith('s') && !word.endsWith('ss') && word.length > 3) return word.slice(0, -1)
  return word
}

/** An existing row of the same name, by case and then by singular/plural ("onions" finds "onion"). */
export function matchName<T extends Lookup>(items: readonly T[], name: string): T | undefined {
  return findByName(items, name) ?? items.find((item) => singular(item.name) === singular(name))
}

/** An imported draft as form state: names matched to existing rows by case and plural, the rest left pending. */
export function fromImport(
  draft: RecipeDraft,
  lists: Record<LookupKind | 'author' | 'tag', readonly Lookup[]>,
  sourceUrl: string | null = null,
): RecipeInitial {
  // The schema only says these are integers, but the API 422s below its minimums (servings 1, times 0); leave it blank instead.
  const atLeast = (min: number, value: number | null) => (value !== null && value >= min ? value : null)
  // Normalized like the backend's fetch, since saving rejects "HTTPS:", spaces and more than SourceUrl's 2048 characters.
  const href = sourceUrl === null ? null : URL.parse(sourceUrl)?.href
  const author = draft.author?.trim() ? findByName(lists.author, draft.author) : undefined
  // Only existing tags: the prompt says so, and a made-up name is dropped rather than created.
  const tagIds = draft.tags.flatMap((name) => findByName(lists.tag, name)?.id ?? [])
  return {
    pendingAuthor: draft.author?.trim() && !author ? draft.author.trim() : undefined,
    scalars: {
      ...emptyScalars,
      author_id: author?.id ?? null,
      tag_ids: [...new Set(tagIds)].sort((a, b) => a - b),
      name: draft.name,
      servings: atLeast(1, draft.servings),
      active_cook_time: atLeast(0, draft.active_cook_time),
      inactive_cook_time: atLeast(0, draft.inactive_cook_time),
      notes: draft.notes?.trim() || null,
      source_url: href && href.length <= 2048 ? href : null,
    },
    ingredients: draft.ingredients.map((line) => {
      const pending: Partial<Record<LookupKind, string>> = {}
      const match = (kind: LookupKind, name: string | null) => {
        if (!name?.trim()) return null
        const found = matchName(lists[kind], name)
        if (!found) pending[kind] = name.trim()
        return found?.id ?? null
      }
      return {
        ingredient_id: match('ingredient', line.ingredient),
        measurement_id: match('measurement', line.measurement),
        preparation_id: match('preparation', line.preparation),
        amount_numerator: line.amount_numerator,
        amount_denominator: line.amount_denominator,
        group: line.group,
        note: line.note,
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
