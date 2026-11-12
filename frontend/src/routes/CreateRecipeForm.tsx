import { useState } from 'react'
import { Link, useNavigate } from 'react-router'

import {
  findByName,
  useCreateIngredient,
  useCreateMeasurement,
  useCreatePreparation,
  useIngredients,
  useMeasurements,
  usePreparations,
} from '../api/lookups'
import { useCreateRecipe, useRecipes } from '../api/recipes'
import { describeError } from '../api/errors'
import type { ImageUpload, RecipeCreate } from '../api/types'
import { emptyIngredient, emptyScalars, isComplete, isFilled, moveItem } from '../components/drafts'
import type { IngredientDraft, LookupKind, RecipeInitial, RecipeScalars } from '../components/drafts'
import { ImageField } from '../components/ImageField'
import { IngredientFields } from '../components/IngredientFields'
import { MoveButtons } from '../components/MoveButtons'
import { jpegUrl } from '../components/photos'
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
 * `RecipeCreate` accepts its children nested. Nothing hits the API until Save,
 * which first creates any lookups an import left pending.
 */
export function CreateRecipeForm({ initial, heading = 'New recipe' }: { initial?: RecipeInitial; heading?: string }) {
  const navigate = useNavigate()
  const createRecipe = useCreateRecipe()
  const { data: recipes, error: recipesError } = useRecipes()
  const lookups = {
    ingredient: [useIngredients().data, useCreateIngredient()],
    measurement: [useMeasurements().data, useCreateMeasurement()],
    preparation: [usePreparations().data, useCreatePreparation()],
  } as const

  const [scalars, setScalars] = useState<RecipeScalars>(initial?.scalars ?? emptyScalars)
  const [ingredients, setIngredients] = useState<Keyed<IngredientDraft>[]>(() => (initial?.ingredients ?? []).map(keyed))
  const [requirements, setRequirements] = useState<Keyed<string>[]>(() => (initial?.requirements ?? []).map(keyed))
  const [steps, setSteps] = useState<Keyed<string>[]>(() => (initial?.steps ?? []).map(keyed))
  const [pendingError, setPendingError] = useState<unknown>(null)
  const [creatingPending, setCreatingPending] = useState(false)
  const [image, setImage] = useState<ImageUpload | null>(null)
  const [convertingImage, setConvertingImage] = useState(false)

  // Names are unique per cookbook, and among recipes without one.
  const duplicate = findByName(
    recipes?.filter((recipe) => recipe.cookbook_id === scalars.cookbook_id),
    scalars.name,
  )
  const incompleteIngredients = ingredients.filter((row) => !isFilled(row.value)).length
  const canSave =
    scalars.name.trim() !== '' &&
    // Without the list the duplicate check can't run, and a 409 would come after creating pending lookups.
    recipes !== undefined &&
    !duplicate &&
    incompleteIngredients === 0 &&
    !createRecipe.isPending &&
    !creatingPending &&
    !convertingImage

  /** The rows without `pending`, each pending name swapped for a row id; each new name is created once. */
  async function resolvePending(rows: IngredientDraft[]): Promise<IngredientDraft[]> {
    const ids = new Map<string, Promise<number>>()
    function idFor(kind: LookupKind, name: string) {
      const key = `${kind}:${name.toLowerCase()}`
      let id = ids.get(key)
      if (id === undefined) {
        const [options, create] = lookups[kind]
        const existing = findByName(options, name)
        id = existing ? Promise.resolve(existing.id) : create.mutateAsync(name).then((created) => created.id)
        ids.set(key, id)
      }
      return id
    }
    const resolve = async (kind: LookupKind, id: number | null, name: string | undefined) =>
      id ?? (name ? await idFor(kind, name) : null)
    return Promise.all(
      rows.map(async ({ pending, ...row }) => ({
        ...row,
        ingredient_id: await resolve('ingredient', row.ingredient_id, pending?.ingredient),
        measurement_id: await resolve('measurement', row.measurement_id, pending?.measurement),
        preparation_id: await resolve('preparation', row.preparation_id, pending?.preparation),
      })),
    )
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!canSave) return
    setCreatingPending(true)
    setPendingError(null)
    let rows: IngredientDraft[]
    try {
      rows = await resolvePending(ingredients.map((row) => row.value))
    } catch (caught) {
      setPendingError(caught)
      return
    } finally {
      setCreatingPending(false)
    }
    const recipeIngredients = rows.filter(isComplete)
    // Never drop a row silently; canSave should already have blocked this.
    if (recipeIngredients.length !== ingredients.length) return

    const body: RecipeCreate = {
      ...scalars,
      name: scalars.name.trim(),
      image,
      recipe_ingredients: recipeIngredients,
      requirements: requirements
        .map((row) => row.value.trim())
        .filter((name) => name !== '')
        .map((name) => ({ name })),
      steps: steps
        .map((row) => row.value.trim())
        .filter((text) => text !== '')
        .map((text) => ({ text })),
    }

    // mutate(), not mutateAsync(): a failure shows through createRecipe.error.
    createRecipe.mutate(body, { onSuccess: (created) => void navigate(`/recipes/${created.id}`) })
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)}>
      <p style={{ marginTop: 0 }}>
        <Link to="/">← All recipes</Link>
      </p>

      <div className="page-header">
        <h1>{heading}</h1>
      </div>

      <div className="stack">
        <section className="card editor-section">
          <RecipeFields value={scalars} onChange={setScalars} />
          {duplicate && (
            <p className="error-box" style={{ marginTop: '1rem' }}>
              <Link to={`/recipes/${duplicate.id}`}>A recipe called “{duplicate.name}”</Link> already exists{' '}
              {duplicate.cookbook ? `in ${duplicate.cookbook.name}` : 'without a cookbook'}. Rename this one or pick
              another cookbook to save it.
            </p>
          )}
        </section>

        <ImageField
          src={image && jpegUrl(image.full)}
          onPick={setImage}
          onRemove={() => setImage(null)}
          onConverting={setConvertingImage}
        />

        <section className="card editor-section">
          <h2 className="section-heading">Ingredients</h2>
          {ingredients.length === 0 && <p className="empty-hint">No ingredients yet.</p>}
          {ingredients.map((row, index) => (
            <div key={row.key} className="child-row">
              <span className="child-row__index">{index + 1}</span>
              <IngredientFields
                value={row.value}
                onChange={(update) =>
                  setIngredients((current) =>
                    current.map((item) => (item.key === row.key ? { ...item, value: update(item.value) } : item)),
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
              <MoveButtons
                label={`step ${index + 1}`}
                index={index}
                count={steps.length}
                onMove={(delta) => setSteps((current) => moveItem(current, index, delta))}
              />
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

        {recipesError && (
          <p className="error-box">Couldn&rsquo;t load recipes to check the name: {describeError(recipesError)}</p>
        )}
        {pendingError !== null && <p className="error-box">{describeError(pendingError)}</p>}
        {createRecipe.error && <p className="error-box">{describeError(createRecipe.error)}</p>}

        <div className="editor-actions">
          <button type="submit" className="primary" disabled={!canSave}>
            {createRecipe.isPending || creatingPending ? 'Saving…' : 'Save recipe'}
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
