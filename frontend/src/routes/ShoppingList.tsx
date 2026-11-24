import { Link } from 'react-router'

import { describeError } from '../api/errors'
import {
  useCheckShoppingLine,
  useClearShoppingList,
  usePutShoppingRecipe,
  useRemoveShoppingRecipe,
  useShoppingList,
} from '../api/shopping'
import { ErrorState, Loading } from '../components/Feedback'
import { formatIngredient } from '../components/ingredient'

/** The one list everyone shares: its recipes, at the servings to shop for, and their ingredients summed. */
export function ShoppingList() {
  const { data: list, isPending, error } = useShoppingList()
  const putRecipe = usePutShoppingRecipe()
  const removeRecipe = useRemoveShoppingRecipe()
  const checkLine = useCheckShoppingLine()
  const clear = useClearShoppingList()

  if (isPending) return <Loading what="shopping list" />
  if (error) return <ErrorState error={error} what="the shopping list" />

  const failure = putRecipe.error ?? removeRecipe.error ?? checkLine.error ?? clear.error
  const handleClear = () => {
    if (confirm('Clear the shopping list for everyone?')) clear.mutate()
  }

  return (
    <>
      <div className="page-header">
        <h1>Shopping list</h1>
        {list.recipes.length > 0 && (
          <button type="button" className="danger" onClick={handleClear} disabled={clear.isPending}>
            Clear list
          </button>
        )}
      </div>

      {failure && <p className="error-box">{describeError(failure)}</p>}

      {list.recipes.length === 0 ? (
        <p className="status">
          Nothing on the list. Add recipes from their pages. <Link to="/">Browse recipes</Link>
        </p>
      ) : (
        <div className="detail-columns">
          <section>
            <h2 className="section-heading">Ingredients</h2>
            {list.lines.length === 0 ? (
              <p className="empty-hint">These recipes list no ingredients.</p>
            ) : (
              <ul className="ingredient-list" aria-label="Ingredients">
                {list.lines.map((line) => (
                  <li key={`${line.ingredient.id}-${line.measurement.id}`}>
                    <label className={line.checked ? 'shopping-line shopping-line--checked' : 'shopping-line'}>
                      <input
                        type="checkbox"
                        checked={line.checked}
                        onChange={(event) =>
                          checkLine.mutate({
                            ingredientId: line.ingredient.id,
                            measurementId: line.measurement.id,
                            checked: event.target.checked,
                          })
                        }
                      />
                      <span>{formatIngredient(line, null, null)}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="section-heading">Recipes</h2>
            <ul className="ingredient-list" aria-label="Recipes on the list">
              {list.recipes.map((recipe) => (
                <li key={recipe.recipe_id}>
                  <div className="row">
                    <Link to={`/recipes/${recipe.recipe_id}`}>{recipe.name}</Link>
                    {/* Each box saves on leaving it; keyed so a change from elsewhere replaces what's shown.
                        Nothing to scale by without a servings count, so that recipe is made in batches. */}
                    {recipe.recipe_servings == null ? (
                      <label className="row muted">
                        Batches
                        <input
                          key={recipe.batches}
                          type="number"
                          min="1"
                          inputMode="numeric"
                          className="shopping-servings"
                          aria-label={`Batches of ${recipe.name}`}
                          defaultValue={recipe.batches}
                          onBlur={(event) => {
                            const batches = Number(event.target.value)
                            if (!Number.isInteger(batches) || batches < 1) event.target.value = String(recipe.batches)
                            else if (batches !== recipe.batches) putRecipe.mutate({ recipeId: recipe.recipe_id, servings: null, batches })
                          }}
                        />
                      </label>
                    ) : (
                      <label className="row muted">
                        Servings
                        <input
                          key={recipe.servings}
                          type="number"
                          min="1"
                          inputMode="numeric"
                          className="shopping-servings"
                          aria-label={`Servings of ${recipe.name}`}
                          defaultValue={recipe.servings ?? recipe.recipe_servings}
                          onBlur={(event) => {
                            const servings = Number(event.target.value)
                            if (!Number.isInteger(servings) || servings < 1)
                              event.target.value = String(recipe.servings ?? recipe.recipe_servings)
                            else if (servings !== recipe.servings) putRecipe.mutate({ recipeId: recipe.recipe_id, servings })
                          }}
                        />
                      </label>
                    )}
                    <button
                      type="button"
                      className="ghost"
                      aria-label={`Remove ${recipe.name}`}
                      onClick={() => removeRecipe.mutate(recipe.recipe_id)}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </>
  )
}
