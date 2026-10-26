import { useParams } from 'react-router'

import { useRecipe } from '../api/recipes'
import { ErrorState, Loading } from '../components/Feedback'
import { CreateRecipeForm } from './CreateRecipeForm'
import { EditRecipeForm } from './EditRecipeForm'

/**
 * One route, two genuinely different forms — because the API is asymmetric.
 *
 * `RecipeCreate` takes nested steps, requirements, and ingredients, so a new
 * recipe is assembled entirely in local state and saved with a single POST.
 * `RecipeUpdate` takes scalar fields only, so an existing recipe's children
 * have to go through their own nested routes; that form mutates each child as
 * you touch it rather than diffing the whole tree on save.
 */
export function RecipeEdit() {
  const { recipeId } = useParams()

  if (recipeId === undefined) return <CreateRecipeForm />

  const id = Number(recipeId)
  if (Number.isNaN(id)) return <ErrorState error={new Error('invalid id')} what="this recipe" />

  return <LoadForEdit id={id} />
}

function LoadForEdit({ id }: { id: number }) {
  const { data: recipe, isPending, error } = useRecipe(id)

  if (isPending) return <Loading what="recipe" />
  if (error) return <ErrorState error={error} what="this recipe" />

  return <EditRecipeForm recipe={recipe} />
}
