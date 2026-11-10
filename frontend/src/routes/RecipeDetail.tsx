import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'

import { useDeleteRecipe, useRecipe } from '../api/recipes'
import { describeError } from '../api/errors'
import type { RecipeIngredient } from '../api/types'
import { ErrorState, Loading } from '../components/Feedback'
import { formatAmount, scaleAmount } from '../components/amount'
import { formatMinutes } from '../components/minutes'

export function RecipeDetail() {
  const { recipeId } = useParams()
  const id = Number(recipeId)
  const navigate = useNavigate()
  const { data: recipe, isPending, error } = useRecipe(Number.isNaN(id) ? undefined : id)
  const deleteRecipe = useDeleteRecipe()
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
          <Link to={`/recipes/${recipe.id}/edit`}>
            <button type="button">Edit</button>
          </Link>
          <button type="button" className="danger" onClick={handleDelete} disabled={deleteRecipe.isPending}>
            {deleteRecipe.isPending ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>

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

/**
 * "1 ½ cups butter, melted".
 *
 * The "whole" measurement is really an absence and reads badly if printed:
 * it means the ingredient is simply counted.
 */
function formatIngredient(item: RecipeIngredient, base: number | null, servings: number | null) {
  const amount =
    base != null && servings != null && servings !== base
      ? scaleAmount(item.amount_numerator, item.amount_denominator, servings, base)
      : { numerator: item.amount_numerator, denominator: item.amount_denominator, exact: true }
  const counted = item.measurement.name.toLowerCase() === 'whole'
  const plural = amount.numerator > amount.denominator

  const unit = counted ? '' : `${plural ? pluralize(item.measurement.name) : item.measurement.name} `
  const name = counted && plural ? pluralize(item.ingredient.name) : item.ingredient.name
  const preparation = item.preparation?.name

  return (
    <>
      <span className="ingredient-amount">
        {amount.exact ? '' : <abbr title="rounded">≈</abbr>}
        {formatAmount(amount.numerator, amount.denominator)}
      </span>{' '}
      <span>
        {unit}
        {name}
      </span>
      {preparation && <span className="ingredient-prep">, {preparation}</span>}
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

function pluralize(word: string) {
  if (word.endsWith('y')) return `${word.slice(0, -1)}ies`
  if (word.endsWith('s') || word.endsWith('h') || word.endsWith('x')) return `${word}es`
  return `${word}s`
}
