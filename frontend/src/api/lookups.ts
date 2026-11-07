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
import { recipeKeys } from './recipes'
import type { Author, Cookbook, CookbookUpdate, Ingredient, Lookup, Measurement, Preparation, Tag } from './types'

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

/** Renames and deletes change names nested in recipes and cookbooks, so refetch those too. */
function useInvalidateAfterEdit(key: readonly string[]) {
  const queryClient = useQueryClient()
  return () =>
    Promise.all(
      [key, ['cookbooks'], recipeKeys.all].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    )
}

/** `usedBy` names what holds a reference, for the 409 a delete of a row in use returns. */
function lookupHooks<T extends Lookup>(resource: string, usedBy: string) {
  const key = [resource] as const
  const path = `/${resource}/`

  return {
    useList: () =>
      useQuery({
        queryKey: key,
        queryFn: () => api.get<T[]>(path),
        // Lookup tables change rarely and are read by every picker on the page.
        staleTime: 5 * 60 * 1000,
      }),

    useCreate: () => {
      const queryClient = useQueryClient()
      return useMutation({
        mutationFn: (name: string) => api.post<T>(path, { name }),
        onSuccess: (created) => {
          // Seed the cache directly so a picker can select the new row
          // immediately, then refetch to stay honest about server ordering.
          queryClient.setQueryData<T[]>(key, (current) => (current ? [...current, created] : [created]))
          void queryClient.invalidateQueries({ queryKey: key })
        },
      })
    },

    useUpdate: () => {
      const onSuccess = useInvalidateAfterEdit(key)
      return useMutation({
        mutationFn: ({ id, name }: { id: number; name: string }) =>
          api.patch<T>(`${path}${id}`, { name }).catch(explainConflict(`Another one is already called “${name}”.`)),
        onSuccess,
      })
    },

    useDelete: () => {
      const onSuccess = useInvalidateAfterEdit(key)
      return useMutation({
        mutationFn: (id: number) =>
          api.delete(`${path}${id}`).catch(explainConflict(`It’s still used by ${usedBy}, so it can’t be deleted.`)),
        onSuccess,
      })
    },
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

export function useCookbooks() {
  return useQuery({
    queryKey: ['cookbooks'],
    queryFn: () => api.get<Cookbook[]>('/cookbooks/'),
    staleTime: 5 * 60 * 1000,
  })
}

export function useUpdateCookbook() {
  const onSuccess = useInvalidateAfterEdit(['cookbooks'])
  return useMutation({
    mutationFn: ({ id, ...changes }: CookbookUpdate & { id: number }) => api.patch<Cookbook>(`/cookbooks/${id}`, changes),
    onSuccess,
  })
}

/** The API unlinks the cookbook's recipes and clears their page numbers. */
export function useDeleteCookbook() {
  const onSuccess = useInvalidateAfterEdit(['cookbooks'])
  return useMutation({ mutationFn: (id: number) => api.delete(`/cookbooks/${id}`), onSuccess })
}
