/**
 * Hooks for the standalone resources: ingredients, measurements, preparations,
 * authors, tags, and cookbooks.
 *
 * Ingredients, measurements, preparations, authors, and tags all have the same shape
 * — an id and a unique name, created from `{ name }` — so they share one hook
 * factory. Cookbooks are separate: they are created with an `author_id` but
 * read back with the whole author nested.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { ApiError, api } from './client'
import type { Author, Cookbook, CookbookCreate, CookbookUpdate, ImageUpload, Ingredient, Lookup, Measurement, Preparation, Tag } from './types'

/**
 * `name` is unique on all of these tables, and POSTing a duplicate returns 409.
 * Callers check the cached list before creating to skip that round trip;
 * `findByName` below is how the pickers do it.
 */
export function findByName<T extends Lookup>(items: readonly T[] | undefined, name: string): T | undefined {
  const needle = name.trim().toLowerCase()
  return items?.find((item) => item.name.trim().toLowerCase() === needle)
}

/** Replaces the API's generic 409 detail with `message`; the original stays on `cause`. */
const explainConflict = (message: string) => (error: unknown) => {
  if (error instanceof ApiError && error.status === 409) throw new Error(message, { cause: error })
  throw error
}

/** `usedBy` names what holds a reference, for the 409 a delete of a row in use returns. */
function lookupHooks<T extends Lookup>(resource: string, usedBy: string) {
  const key = [resource] as const
  const path = `/${resource}/`

  return {
    useList: () => useQuery({ queryKey: key, queryFn: () => api.get<T[]>(path) }),

    useCreate: () => {
      const queryClient = useQueryClient()
      return useMutation({
        mutationFn: (name: string) => api.post<T>(path, { name }),
        // The refresh after every mutation (queryClient.ts) can fail without throwing, so seed
        // the list for the picker to show the row it selects. Only a loaded list: seeding an
        // unloaded one would pass off a one-row list as complete.
        onSuccess: (created) => queryClient.setQueryData<T[]>(key, (current) => current && [...current, created]),
      })
    },

    useUpdate: () =>
      useMutation({
        mutationFn: ({ id, name }: { id: number; name: string }) =>
          api.patch<T>(`${path}${id}`, { name }).catch(explainConflict(`Another one is already called “${name}”.`)),
      }),

    useDelete: () =>
      useMutation({
        mutationFn: (id: number) =>
          api.delete(`${path}${id}`).catch(explainConflict(`It’s still used by ${usedBy}, so it can’t be deleted.`)),
      }),
  }
}

export const ingredients = lookupHooks<Ingredient>('ingredients', 'a recipe')
export const measurements = lookupHooks<Measurement>('measurements', 'a recipe')
export const preparations = lookupHooks<Preparation>('preparations', 'a recipe')
export const authors = lookupHooks<Author>('authors', 'a cookbook')
// Deleting a tag removes it from its recipes, so its delete never conflicts.
export const tags = lookupHooks<Tag>('tags', 'a recipe')

export const useIngredients = ingredients.useList
export const useCreateIngredient = ingredients.useCreate
export const useMeasurements = measurements.useList
export const useCreateMeasurement = measurements.useCreate
export const usePreparations = preparations.useList
export const useCreatePreparation = preparations.useCreate
export const useAuthors = authors.useList
export const useCreateAuthor = authors.useCreate
export const useTags = tags.useList
export const useCreateTag = tags.useCreate

export function useCookbooks() {
  return useQuery({ queryKey: ['cookbooks'], queryFn: () => api.get<Cookbook[]>('/cookbooks/') })
}

/** Explains the unique-name 409; a 409 for a missing author (deleted elsewhere) keeps the API's text. */
const cookbookClash = (error: unknown) => {
  if (error instanceof ApiError && error.message === 'Already exists')
    throw new Error('That author already has a cookbook with this name.', { cause: error })
  throw error
}

export function useCreateCookbook() {
  return useMutation({
    mutationFn: (cookbook: CookbookCreate) => api.post<Cookbook>('/cookbooks/', cookbook).catch(cookbookClash),
  })
}

export function useUpdateCookbook() {
  return useMutation({
    mutationFn: ({ id, ...changes }: CookbookUpdate & { id: number }) =>
      api.patch<Cookbook>(`/cookbooks/${id}`, changes).catch(cookbookClash),
  })
}

/** The API unlinks the cookbook's recipes and clears their page numbers. */
export function useDeleteCookbook() {
  return useMutation({ mutationFn: (id: number) => api.delete(`/cookbooks/${id}`) })
}

export const useSetCookbookImage = (id: number) =>
  useMutation({ mutationFn: (image: ImageUpload) => api.put<Cookbook>(`/cookbooks/${id}/image`, image) })

export const useRemoveCookbookImage = (id: number) =>
  useMutation({ mutationFn: () => api.delete(`/cookbooks/${id}/image`) })
