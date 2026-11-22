/** The one shopping list every user shares: recipes at a servings count, and the lines ticked off. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from './client'
import type { ShoppingList } from './types'

export const shoppingKeys = { list: ['shopping-list'] as const }

export const useShoppingList = () =>
  useQuery({
    queryKey: shoppingKeys.list,
    queryFn: () => api.get<ShoppingList>('/shopping-list'),
  })

/** Adds a recipe, or changes the servings it's shopped for; null means as written. */
export const usePutShoppingRecipe = () =>
  useMutation({
    mutationFn: ({ recipeId, servings }: { recipeId: number; servings: number | null }) =>
      api.put<ShoppingList>(`/shopping-list/recipes/${recipeId}`, { servings }),
  })

export const useRemoveShoppingRecipe = () =>
  useMutation({
    mutationFn: (recipeId: number) => api.delete(`/shopping-list/recipes/${recipeId}`),
  })

type Check = { ingredientId: number; measurementId: number; checked: boolean }

/** Ticks at once, so a slow connection in the shop doesn't lag the box; the refetch settles it either way. */
export function useCheckShoppingLine() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ ingredientId, measurementId, checked }: Check) => {
      const path = `/shopping-list/checks/${ingredientId}/${measurementId}`
      return checked ? api.put<void>(path, undefined) : api.delete(path)
    },
    onMutate: ({ ingredientId, measurementId, checked }: Check) => {
      // A refetch already in flight would land the old tick on top of this one.
      void queryClient.cancelQueries({ queryKey: shoppingKeys.list })
      queryClient.setQueryData<ShoppingList>(
        shoppingKeys.list,
        (list) =>
          list && {
            ...list,
            lines: list.lines.map((line) =>
              line.ingredient.id === ingredientId && line.measurement.id === measurementId ? { ...line, checked } : line,
            ),
          },
      )
    },
  })
}

export const useClearShoppingList = () => useMutation({ mutationFn: () => api.delete('/shopping-list') })
