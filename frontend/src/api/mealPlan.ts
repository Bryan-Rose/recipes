/** The one meal plan every user shares: recipes on days, which can be put on the shopping list a week at a time. */
import { useMutation, useQuery } from '@tanstack/react-query'

import { api } from './client'
import type { PlannedMeal, ShoppingList } from './types'

/** Days are ISO dates (YYYY-MM-DD); end is included. */
export const useMealPlan = (start: string, end: string) =>
  useQuery({
    queryKey: ['meal-plan', start, end],
    queryFn: () => api.get<PlannedMeal[]>(`/meal-plan/meals?start=${start}&end=${end}`),
  })

export const useAddMeal = () =>
  useMutation({
    mutationFn: (meal: { recipe_id: number; day: string; servings: number | null }) => api.post<PlannedMeal>('/meal-plan/meals', meal),
  })

/** null means as written. */
export const usePutMeal = () =>
  useMutation({
    mutationFn: ({ id, servings }: { id: number; servings: number | null }) => api.put<PlannedMeal>(`/meal-plan/meals/${id}`, { servings }),
  })

export const useRemoveMeal = () => useMutation({ mutationFn: (id: number) => api.delete(`/meal-plan/meals/${id}`) })

export const useShopMeals = () =>
  useMutation({
    mutationFn: (range: { start: string; end: string }) => api.post<ShoppingList>('/meal-plan/shop', range),
  })
