import { Link, useNavigate, useParams } from 'react-router'

import { useDeleteRecipe, useRecipe } from '../api/recipes'
import { describeError } from '../api/errors'
import type { RecipeIngredient } from '../api/types'
import { ErrorState, Loading } from '../components/Feedback'

export function RecipeDetail() {
  const { recipeId } = useParams()
  const id = Number(recipeId)
  const navigate = useNavigate()
  const { data: recipe, isPending, error } = useRecipe(Number.isNaN(id) ? undefined : id)
  const deleteRecipe = useDeleteRecipe()

  if (Number.isNaN(id)) return <ErrorState error={new Error('invalid id')} what="this recipe" />
  if (isPending) return <Loading what="recipe" />
  if (error) return <ErrorState error={error} what="this recipe" />

  const meta = [
    recipe.active_cook_time && { label: 'Active', value: recipe.active_cook_time },
    recipe.inactive_cook_time && { label: 'Inactive', value: recipe.inactive_cook_time },
    recipe.servings && { label: 'Servings', value: recipe.servings },
    recipe.cookbook && {
      label: 'From',
      value: `${recipe.cookbook.name}${recipe.cookbook_page ? `, p. ${recipe.cookbook_page}` : ''}`,
    },
    recipe.cookbook && { label: 'Author', value: recipe.cookbook.author.name },
  ].filter((item): item is { label: string; value: string } => Boolean(item))

  const handleDelete = async () => {
    if (!confirm(`Delete “${recipe.name}”? This cannot be undone.`)) return
    await deleteRecipe.mutateAsync(recipe.id)
    void navigate('/')
  }

  return (
    <>
      <p style={{ marginTop: 0 }}>
        <Link to="/">← All recipes</Link>
      </p>

      <div className="page-header">
        <h1>{recipe.name}</h1>
        <div className="row">
          <Link to={`/recipes/${recipe.id}/edit`}>
            <button type="button">Edit</button>
          </Link>
          <button type="button" className="danger" onClick={() => void handleDelete()} disabled={deleteRecipe.isPending}>
            {deleteRecipe.isPending ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>

      {deleteRecipe.error && <p className="error-box">{describeError(deleteRecipe.error)}</p>}

      {meta.length > 0 && (
        <div className="card detail-meta">
          {meta.map((item) => (
            <div key={item.label} className="detail-meta__item">
              <span className="detail-meta__label">{item.label}</span>
              <span>{item.value}</span>
            </div>
          ))}
        </div>
      )}

      <div className="detail-columns">
        <div className="stack">
          <section>
            <h2 className="section-heading">Ingredients</h2>
            {recipe.recipe_ingredients.length === 0 ? (
              <p className="empty-hint">None listed.</p>
            ) : (
              <ul className="ingredient-list">
                {recipe.recipe_ingredients.map((item) => (
                  <li key={item.id}>{formatIngredient(item)}</li>
                ))}
              </ul>
            )}
          </section>

          {recipe.requirements.length > 0 && (
            <section>
              <h2 className="section-heading">You&rsquo;ll need</h2>
              <ul className="requirement-list">
                {recipe.requirements.map((item) => (
                  <li key={item.id}>{item.name}</li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <section>
          <h2 className="section-heading">Method</h2>
          {recipe.steps.length === 0 ? (
            <p className="empty-hint">No steps yet.</p>
          ) : (
            <ol className="step-list">
              {recipe.steps.map((step) => (
                <li key={step.id}>
                  <span>{step.text}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </>
  )
}

/**
 * "2 cups butter, melted".
 *
 * Two measurement values are really absences and read badly if printed: the
 * "whole" preparation (which the non-nullable column forces every row to carry)
 * and the "whole" measurement, which means the ingredient is simply counted.
 */
function formatIngredient(item: RecipeIngredient) {
  const counted = item.measurement.name.toLowerCase() === 'whole'
  const plural = item.amount !== 1

  const unit = counted ? '' : `${plural ? pluralize(item.measurement.name) : item.measurement.name} `
  const name = counted && plural ? pluralize(item.ingredient.name) : item.ingredient.name
  const preparation = item.preparation.name.toLowerCase() === 'whole' ? null : item.preparation.name

  return (
    <>
      <span className="ingredient-amount">{item.amount}</span>{' '}
      <span>
        {unit}
        {name}
      </span>
      {preparation && <span className="ingredient-prep">, {preparation}</span>}
    </>
  )
}

function pluralize(word: string) {
  if (word.endsWith('y')) return `${word.slice(0, -1)}ies`
  if (word.endsWith('s') || word.endsWith('h') || word.endsWith('x')) return `${word}es`
  return `${word}s`
}
