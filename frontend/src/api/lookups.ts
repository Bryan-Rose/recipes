/**
 * Hooks for the standalone resources: ingredients, measurements, preparations,
 * authors, and cookbooks.
 *
 * Ingredients, measurements, preparations, and authors all have the same shape
 * — an id and a unique name, created from `{ name }` — so they share one hook
 * factory. Cookbooks are separate: they are created with an `author_id` but
 * read back with the whole author nested.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from './client'
import type { Author, Cookbook, Ingredient, Lookup, Measurement, Preparation } from './types'

/**
 * `name` is unique on all of these tables, and POSTing a duplicate returns 409.
 * Callers check the cached list before creating to skip that round trip;
 * `findByName` below is how the pickers do it.
 */
export function findByName<T extends Lookup>(items: readonly T[] | undefined, name: string): T | undefined {
  const needle = name.trim().toLowerCase()
  return items?.find((item) => item.name.trim().toLowerCase() === needle)
}

function lookupHooks<T extends Lookup>(resource: string) {
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
  }
}

const ingredients = lookupHooks<Ingredient>('ingredients')
const measurements = lookupHooks<Measurement>('measurements')
const preparations = lookupHooks<Preparation>('preparations')
const authors = lookupHooks<Author>('authors')

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
