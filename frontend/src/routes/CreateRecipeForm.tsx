import { useState } from 'react'
import { Link, useNavigate } from 'react-router'

import { useCreateRecipe } from '../api/recipes'
import { describeError } from '../api/errors'
import type { RecipeCreate } from '../api/types'
import { emptyIngredient, emptyScalars, isComplete } from '../components/drafts'
import type { IngredientDraft, RecipeScalars } from '../components/drafts'
import { IngredientFields } from '../components/IngredientFields'
import { RecipeFields } from '../components/RecipeFields'

/** Local rows need a stable key before the server has given them an id. */
interface Keyed<T> {
  key: number
  value: T
}

let nextKey = 0
function keyed<T>(value: T): Keyed<T> {
  nextKey += 1
  return { key: nextKey, value }
}

/**
 * A new recipe is built entirely client-side and saved in one POST, because
 * `RecipeCreate` accepts its children nested. Nothing hits the API until Save.
 */
export function CreateRecipeForm() {
  const navigate = useNavigate()
  const createRecipe = useCreateRecipe()

  const [scalars, setScalars] = useState<RecipeScalars>(emptyScalars)
  const [ingredients, setIngredients] = useState<Keyed<IngredientDraft>[]>([])
  const [requirements, setRequirements] = useState<Keyed<string>[]>([])
  const [steps, setSteps] = useState<Keyed<string>[]>([])

  const incompleteIngredients = ingredients.filter((row) => !isComplete(row.value)).length
  const canSave = scalars.name.trim() !== '' && incompleteIngredients === 0 && !createRecipe.isPending

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!canSave) return

    const body: RecipeCreate = {
      ...scalars,
      name: scalars.name.trim(),
      // Only complete rows reach here — canSave blocks the rest.
      recipe_ingredients: ingredients.map((row) => ({
        ingredient_id: row.value.ingredient_id as number,
        measurement_id: row.value.measurement_id as number,
        preparation_id: row.value.preparation_id as number,
        amount: row.value.amount,
      })),
      requirements: requirements
        .map((row) => row.value.trim())
        .filter((name) => name !== '')
        .map((name) => ({ name })),
      steps: steps
        .map((row) => row.value.trim())
        .filter((text) => text !== '')
        .map((text) => ({ text })),
    }

    const created = await createRecipe.mutateAsync(body)
    void navigate(`/recipes/${created.id}`)
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)}>
      <p style={{ marginTop: 0 }}>
        <Link to="/">← All recipes</Link>
      </p>

      <div className="page-header">
        <h1>New recipe</h1>
      </div>

      <div className="stack">
        <section className="card editor-section">
          <RecipeFields value={scalars} onChange={setScalars} />
        </section>

        <section className="card editor-section">
          <h2 className="section-heading">Ingredients</h2>
          {ingredients.length === 0 && <p className="empty-hint">No ingredients yet.</p>}
          {ingredients.map((row, index) => (
            <div key={row.key} className="child-row">
              <span className="child-row__index">{index + 1}</span>
              <IngredientFields
                value={row.value}
                onChange={(next) =>
                  setIngredients((current) =>
                    current.map((item) => (item.key === row.key ? { ...item, value: next } : item)),
                  )
                }
              />
              <button
                type="button"
                className="ghost"
                aria-label={`Remove ingredient ${index + 1}`}
                onClick={() => setIngredients((current) => current.filter((item) => item.key !== row.key))}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            style={{ marginTop: '0.75rem' }}
            onClick={() => setIngredients((current) => [...current, keyed(emptyIngredient)])}
          >
            + Add ingredient
          </button>
        </section>

        <section className="card editor-section">
          <h2 className="section-heading">You&rsquo;ll need</h2>
          {requirements.length === 0 && <p className="empty-hint">No equipment listed.</p>}
          {requirements.map((row, index) => (
            <div key={row.key} className="child-row">
              <span className="child-row__index">{index + 1}</span>
              <div className="child-row__body">
                <input
                  type="text"
                  value={row.value}
                  placeholder="Large pot"
                  onChange={(event) =>
                    setRequirements((current) =>
                      current.map((item) => (item.key === row.key ? { ...item, value: event.target.value } : item)),
                    )
                  }
                />
              </div>
              <button
                type="button"
                className="ghost"
                aria-label={`Remove item ${index + 1}`}
                onClick={() => setRequirements((current) => current.filter((item) => item.key !== row.key))}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            style={{ marginTop: '0.75rem' }}
            onClick={() => setRequirements((current) => [...current, keyed('')])}
          >
            + Add item
          </button>
        </section>

        <section className="card editor-section">
          <h2 className="section-heading">Method</h2>
          {steps.length === 0 && <p className="empty-hint">No steps yet.</p>}
          {steps.map((row, index) => (
            <div key={row.key} className="child-row">
              <span className="child-row__index">{index + 1}</span>
              <div className="child-row__body">
                <textarea
                  value={row.value}
                  placeholder="Describe this step…"
                  onChange={(event) =>
                    setSteps((current) =>
                      current.map((item) => (item.key === row.key ? { ...item, value: event.target.value } : item)),
                    )
                  }
                />
              </div>
              <button
                type="button"
                className="ghost"
                aria-label={`Remove step ${index + 1}`}
                onClick={() => setSteps((current) => current.filter((item) => item.key !== row.key))}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            style={{ marginTop: '0.75rem' }}
            onClick={() => setSteps((current) => [...current, keyed('')])}
          >
            + Add step
          </button>
        </section>

        {createRecipe.error && <p className="error-box">{describeError(createRecipe.error)}</p>}

        <div className="editor-actions">
          <button type="submit" className="primary" disabled={!canSave}>
            {createRecipe.isPending ? 'Saving…' : 'Save recipe'}
          </button>
          <Link to="/">
            <button type="button" className="ghost">
              Cancel
            </button>
          </Link>
          {incompleteIngredients > 0 && (
            <span className="muted">
              {incompleteIngredients} ingredient {incompleteIngredients === 1 ? 'row needs' : 'rows need'} every field
              filled in.
            </span>
          )}
        </div>
      </div>
    </form>
  )
}
