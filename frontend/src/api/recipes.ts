/**
 * Hooks for recipes and their owned children.
 *
 * Note the asymmetry in the API, which is why the editor works two ways:
 * `RecipeCreate` accepts nested steps, requirements, and ingredients, so a new
 * recipe is one POST. `RecipeUpdate` accepts scalar fields only, so editing an
 * existing recipe's children means individual calls to the nested routes.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from './client'
import type {
  Recipe,
  RecipeCreate,
  RecipeIngredient,
  RecipeIngredientCreate,
  RecipeIngredientUpdate,
  RecipeUpdate,
  Requirement,
  RequirementCreate,
  Step,
  StepCreate,
} from './types'

export const recipeKeys = {
  all: ['recipes'] as const,
  detail: (id: number) => ['recipes', id] as const,
}

export function useRecipes() {
  return useQuery({
    queryKey: recipeKeys.all,
    // GET /recipes/ returns the fully nested shape for every recipe — the list
    // page renders a fraction of it. Fine at this scale, worth revisiting if
    // the collection grows.
    queryFn: () => api.get<Recipe[]>('/recipes/'),
  })
}

export function useRecipe(id: number | undefined) {
  return useQuery({
    queryKey: recipeKeys.detail(id ?? -1),
    queryFn: () => api.get<Recipe>(`/recipes/${id}`),
    enabled: id !== undefined,
  })
}

export function useCreateRecipe() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (recipe: RecipeCreate) => api.post<Recipe>('/recipes/', recipe),
    onSuccess: (created) => {
      queryClient.setQueryData(recipeKeys.detail(created.id), created)
      void queryClient.invalidateQueries({ queryKey: recipeKeys.all })
    },
  })
}

export function useUpdateRecipe(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (patch: RecipeUpdate) => api.patch<Recipe>(`/recipes/${id}`, patch),
    onSuccess: (updated) => {
      queryClient.setQueryData(recipeKeys.detail(id), updated)
      void queryClient.invalidateQueries({ queryKey: recipeKeys.all })
    },
  })
}

export function useDeleteRecipe() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.delete(`/recipes/${id}`),
    onSuccess: (_result, id) => {
      queryClient.removeQueries({ queryKey: recipeKeys.detail(id) })
      void queryClient.invalidateQueries({ queryKey: recipeKeys.all })
    },
  })
}

/**
 * Children are owned by a recipe, so every mutation on one invalidates that
 * recipe's detail query and lets the server hand back the new nested state.
 * This is the whole reason the edit page can skip a client-side diff engine.
 */
function childHooks<TRead, TCreate, TUpdate>(segment: string) {
  return {
    useCreate: (recipeId: number) => {
      const queryClient = useQueryClient()
      return useMutation({
        mutationFn: (body: TCreate) => api.post<TRead>(`/recipes/${recipeId}/${segment}/`, body),
        onSuccess: () => invalidate(queryClient, recipeId),
      })
    },

    useUpdate: (recipeId: number) => {
      const queryClient = useQueryClient()
      return useMutation({
        mutationFn: ({ id, patch }: { id: number; patch: TUpdate }) =>
          api.patch<TRead>(`/recipes/${recipeId}/${segment}/${id}`, patch),
        onSuccess: () => invalidate(queryClient, recipeId),
      })
    },

    useDelete: (recipeId: number) => {
      const queryClient = useQueryClient()
      return useMutation({
        mutationFn: (id: number) => api.delete(`/recipes/${recipeId}/${segment}/${id}`),
        onSuccess: () => invalidate(queryClient, recipeId),
      })
    },
  }
}

function invalidate(queryClient: ReturnType<typeof useQueryClient>, recipeId: number) {
  void queryClient.invalidateQueries({ queryKey: recipeKeys.detail(recipeId) })
  void queryClient.invalidateQueries({ queryKey: recipeKeys.all })
}

const steps = childHooks<Step, StepCreate, { text: string }>('steps')
export const useCreateStep = steps.useCreate
export const useUpdateStep = steps.useUpdate
export const useDeleteStep = steps.useDelete

/** Sends the full new order. The list moves at once; the refetch settles it either way. */
export function useReorderSteps(recipeId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (stepIds: number[]) => api.put<Step[]>(`/recipes/${recipeId}/step-order`, { step_ids: stepIds }),
    onMutate: async (stepIds) => {
      // A refetch already in flight would land the old order on top of this one.
      await queryClient.cancelQueries({ queryKey: recipeKeys.detail(recipeId) })
      queryClient.setQueryData<Recipe>(recipeKeys.detail(recipeId), (recipe) =>
        recipe && { ...recipe, steps: stepIds.flatMap((id) => recipe.steps.filter((step) => step.id === id)) },
      )
    },
    onSettled: () => invalidate(queryClient, recipeId),
  })
}

const requirements = childHooks<Requirement, RequirementCreate, { name: string }>('requirements')
export const useCreateRequirement = requirements.useCreate
export const useUpdateRequirement = requirements.useUpdate
export const useDeleteRequirement = requirements.useDelete

const recipeIngredients = childHooks<RecipeIngredient, RecipeIngredientCreate, RecipeIngredientUpdate>(
  'recipeingredients',
)
export const useCreateRecipeIngredient = recipeIngredients.useCreate
export const useUpdateRecipeIngredient = recipeIngredients.useUpdate
export const useDeleteRecipeIngredient = recipeIngredients.useDelete
