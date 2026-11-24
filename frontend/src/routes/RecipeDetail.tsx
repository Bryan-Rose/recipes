import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'

import { imageUrl, useDeleteRecipe, useRecipe } from '../api/recipes'
import { describeError } from '../api/errors'
import { usePutShoppingRecipe, useShoppingList } from '../api/shopping'
import { formatCost } from '../components/cost'
import { ErrorState, Loading } from '../components/Feedback'
import { formatIngredient } from '../components/ingredient'
import { formatMinutes } from '../components/minutes'

export function RecipeDetail() {
  const { recipeId } = useParams()
  const id = Number(recipeId)
  const navigate = useNavigate()
  const { data: recipe, isPending, error } = useRecipe(Number.isNaN(id) ? undefined : id)
  const deleteRecipe = useDeleteRecipe()
  const shoppingList = useShoppingList()
  const addToList = usePutShoppingRecipe()
  // The servings box as typed; null until the reader changes it. Resets on load.
  const [servingsDraft, setServingsDraft] = useState<string | null>(null)

  if (Number.isNaN(id)) return <ErrorState error={new Error('invalid id')} what="this recipe" />
  if (isPending) return <Loading what="recipe" />
  if (error) return <ErrorState error={error} what="this recipe" />

  const meta = [
    recipe.active_cook_time != null && { label: 'Active', value: formatMinutes(recipe.active_cook_time) as ReactNode },
    recipe.inactive_cook_time != null && { label: 'Inactive', value: formatMinutes(recipe.inactive_cook_time) },
    recipe.cookbook && {
      label: 'From',
      value: (
        <>
          <Link to={`/cookbooks/${recipe.cookbook.id}`}>{recipe.cookbook.name}</Link>
          {recipe.cookbook_page ? `, p. ${recipe.cookbook_page}` : ''}
        </>
      ),
    },
    recipe.cookbook && {
      label: 'Author',
      value: <Link to={`/authors/${recipe.cookbook.author.id}`}>{recipe.cookbook.author.name}</Link>,
    },
    recipe.source_url && {
      label: 'Source',
      value: (
        <a href={recipe.source_url} target="_blank" rel="noreferrer">
          {/^https?:\/\/([^/?#:]+)/.exec(recipe.source_url)?.[1] ?? recipe.source_url}
        </a>
      ),
    },
    recipe.source_import && { label: 'Import cost', value: formatCost(recipe.source_import.cost_usd) },
  ].filter((item): item is { label: string; value: ReactNode } => Boolean(item))

  const typed = Number(servingsDraft)
  // Scale against the recipe's own servings; a cleared or invalid box means unscaled.
  const servings = Number.isInteger(typed) && typed >= 1 ? typed : (recipe.servings ?? null)

  const handleDelete = () => {
    if (!confirm(`Delete “${recipe.name}”? This cannot be undone.`)) return
    // mutate(), not mutateAsync(): a failure shows through deleteRecipe.error.
    deleteRecipe.mutate(recipe.id, { onSuccess: () => void navigate('/') })
  }

  return (
    <>
      <p style={{ marginTop: 0 }}>
        <Link to="/">← All recipes</Link>
      </p>

      <div className="page-header">
        <h1>{recipe.name}</h1>
        <div className="row">
          {shoppingList.data?.recipes.some((item) => item.recipe_id === recipe.id) ? (
            <Link to="/shopping" className="button">
              On shopping list
            </Link>
          ) : (
            <button
              type="button"
              // At the servings shown, so scaling here first carries over.
              onClick={() => addToList.mutate({ recipeId: recipe.id, servings: recipe.servings == null ? null : servings })}
              disabled={!shoppingList.data || addToList.isPending}
            >
              Add to shopping list
            </button>
          )}
          <Link to={`/recipes/${recipe.id}/edit`} className="button">
            Edit
          </Link>
          <button type="button" className="danger" onClick={handleDelete} disabled={deleteRecipe.isPending}>
            {deleteRecipe.isPending ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>

      {recipe.image && <img className="recipe-cover" src={imageUrl(recipe.image)} alt={recipe.name} />}

      {recipe.tags.length > 0 && (
        <ul className="tag-list" aria-label="Tags" style={{ marginBottom: '1rem' }}>
          {recipe.tags.toSorted((a, b) => a.name.localeCompare(b.name)).map((tag) => (
            <li key={tag.id} className="tag">
              <Link to={`/?tag=${tag.id}`}>{tag.name}</Link>
            </li>
          ))}
        </ul>
      )}

      {deleteRecipe.error && <p className="error-box">{describeError(deleteRecipe.error)}</p>}
      {addToList.error && <p className="error-box">{describeError(addToList.error)}</p>}

      {(meta.length > 0 || recipe.servings != null) && (
        <div className="card detail-meta">
          {recipe.servings != null && servings != null && (
            <ServingsScaler value={servingsDraft ?? String(recipe.servings)} servings={servings} onChange={setServingsDraft} />
          )}
          {meta.map((item) => (
            <div key={item.label} className="detail-meta__item">
              <span className="detail-meta__label">{item.label}</span>
              <span>{item.value}</span>
            </div>
          ))}
        </div>
      )}

      {recipe.notes && (
        <section>
          <h2 className="section-heading">Notes</h2>
          <p className="recipe-notes">{recipe.notes}</p>
        </section>
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
                  <li key={item.id}>{formatIngredient(item, recipe.servings ?? null, servings)}</li>
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

/** The servings count as an editable number with −/+ steppers. */
function ServingsScaler({
  value,
  servings,
  onChange,
}: {
  value: string
  servings: number
  onChange: (next: string) => void
}) {
  return (
    <div className="detail-meta__item">
      <label htmlFor="detail-servings" className="detail-meta__label">
        Servings
      </label>
      <div className="row servings-scaler">
        <button type="button" aria-label="Fewer servings" disabled={servings <= 1} onClick={() => onChange(String(servings - 1))}>
          −
        </button>
        <input
          id="detail-servings"
          type="number"
          min="1"
          inputMode="numeric"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <button type="button" aria-label="More servings" onClick={() => onChange(String(servings + 1))}>
          +
        </button>
      </div>
    </div>
  )
}
