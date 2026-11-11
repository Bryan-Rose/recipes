/**
 * Hooks for recipes and their owned children.
 *
 * Note the asymmetry in the API, which is why the editor works two ways:
 * `RecipeCreate` accepts nested steps, requirements, and ingredients, so a new
 * recipe is one POST. `RecipeUpdate` accepts scalar fields only, so editing an
 * existing recipe's children means individual calls to the nested routes.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { ApiError, api } from './client'
import type {
  Recipe,
  RecipeCreate,
  RecipeImport,
  RecipeIngredient,
  RecipeIngredientCreate,
  RecipeIngredientUpdate,
  RecipeSummary,
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
    // A summary per recipe; the list pages search, filter and sort it client side.
    queryFn: () => api.get<RecipeSummary[]>('/recipes/'),
  })
}

export function useRecipe(id: number | undefined) {
  return useQuery({
    queryKey: recipeKeys.detail(id ?? -1),
    queryFn: () => api.get<Recipe>(`/recipes/${id}`),
    enabled: id !== undefined,
  })
}

/** 409 "Unknown tag ids": a picked tag was deleted elsewhere. The API's detail stays on `cause`. */
function explainUnknownTags(error: unknown): never {
  if (error instanceof ApiError && error.status === 409 && error.message.startsWith('Unknown tag ids'))
    throw new Error('A tag you picked no longer exists. Refresh and pick again.', { cause: error })
  throw error
}

export const useCreateRecipe = () =>
  useMutation({ mutationFn: (recipe: RecipeCreate) => api.post<Recipe>('/recipes/', recipe).catch(explainUnknownTags) })

/** Parses pasted text into a draft for review, with what the parse cost; saves nothing. */
export const useImportText = () =>
  useMutation({ mutationFn: (text: string) => api.post<RecipeImport>('/imports/text', { text }) })

export const useUpdateRecipe = (id: number) =>
  useMutation({
    mutationFn: (patch: RecipeUpdate) => api.patch<Recipe>(`/recipes/${id}`, patch).catch(explainUnknownTags),
  })

export function useDeleteRecipe() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.delete(`/recipes/${id}`),
    // Drop it rather than let the refresh after every mutation refetch it into a 404.
    onSuccess: (_result, id) => queryClient.removeQueries({ queryKey: recipeKeys.detail(id) }),
  })
}

/**
 * Children are owned by a recipe. After each change the refetched recipe
 * (see queryClient.ts) carries the new nested state, which is the whole reason
 * the edit page can skip a client-side diff engine.
 */
function childHooks<TRead, TCreate, TUpdate>(segment: string) {
  return {
    useCreate: (recipeId: number) =>
      useMutation({ mutationFn: (body: TCreate) => api.post<TRead>(`/recipes/${recipeId}/${segment}/`, body) }),

    useUpdate: (recipeId: number) =>
      useMutation({
        mutationFn: ({ id, patch }: { id: number; patch: TUpdate }) =>
          api.patch<TRead>(`/recipes/${recipeId}/${segment}/${id}`, patch),
      }),

    useDelete: (recipeId: number) =>
      useMutation({ mutationFn: (id: number) => api.delete(`/recipes/${recipeId}/${segment}/${id}`) }),
  }
}

const steps = childHooks<Step, StepCreate, { text: string }>('steps')
export const useCreateStep = steps.useCreate
export const useUpdateStep = steps.useUpdate
export const useDeleteStep = steps.useDelete

/** Sends the full new order. The list moves at once; the refetch settles it either way. */
export function useReorderSteps(recipeId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (stepIds: number[]) =>
      api.put<Step[]>(`/recipes/${recipeId}/step-order`, { step_ids: stepIds }).catch((error: unknown) => {
        // 409: the ids no longer match the recipe's steps. The API's detail stays on `cause` for debugging.
        if (error instanceof ApiError && error.status === 409)
          throw new Error('The steps changed since this page loaded. The list has been refreshed; try the move again.', {
            cause: error,
          })
        throw error
      }),
    onMutate: async (stepIds) => {
      // A refetch already in flight would land the old order on top of this one.
      await queryClient.cancelQueries({ queryKey: recipeKeys.detail(recipeId) })
      queryClient.setQueryData<Recipe>(recipeKeys.detail(recipeId), (recipe) =>
        recipe && { ...recipe, steps: stepIds.flatMap((id) => recipe.steps.filter((step) => step.id === id)) },
      )
    },
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
