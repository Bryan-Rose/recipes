import { useId, useState } from 'react'
import { Link, useNavigate } from 'react-router'

import {
  useCreateRecipeIngredient,
  useCreateRequirement,
  useCreateStep,
  useDeleteRecipeIngredient,
  useDeleteRequirement,
  useDeleteStep,
  useUpdateRecipe,
  useUpdateRecipeIngredient,
  useUpdateRequirement,
  useUpdateStep,
} from '../api/recipes'
import { describeError } from '../api/errors'
import type { Recipe } from '../api/types'
import { emptyIngredient, isComplete } from '../components/drafts'
import type { IngredientDraft, RecipeScalars } from '../components/drafts'
import { IngredientFields } from '../components/IngredientFields'
import { RecipeFields } from '../components/RecipeFields'

/**
 * Editing an existing recipe. `RecipeUpdate` only accepts scalar fields, so
 * the children are managed through their own nested routes and each change is
 * sent as it happens — a single "Save" covering the whole tree would mean
 * diffing loaded state against form state and replaying the difference, which
 * is a lot of fragile machinery to save a few round trips.
 */
export function EditRecipeForm({ recipe }: { recipe: Recipe }) {
  const navigate = useNavigate()

  const updateRecipe = useUpdateRecipe(recipe.id)

  // Hoisted rather than called inline in JSX: hooks must run in the same order
  // on every render, and oxlint's rules-of-hooks wants them at the top.
  const createRequirement = useCreateRequirement(recipe.id)
  const updateRequirement = useUpdateRequirement(recipe.id)
  const deleteRequirement = useDeleteRequirement(recipe.id)
  const createStep = useCreateStep(recipe.id)
  const updateStep = useUpdateStep(recipe.id)
  const deleteStep = useDeleteStep(recipe.id)

  const [scalars, setScalars] = useState<RecipeScalars>(() => toScalars(recipe))
  const isDirty = JSON.stringify(scalars) !== JSON.stringify(toScalars(recipe))

  async function saveScalars(event: React.FormEvent) {
    event.preventDefault()
    await updateRecipe.mutateAsync({ ...scalars, name: scalars.name.trim() })
  }

  return (
    <>
      <p style={{ marginTop: 0 }}>
        <Link to={`/recipes/${recipe.id}`}>← Back to {recipe.name}</Link>
      </p>

      <div className="page-header">
        <h1>Edit recipe</h1>
        <button type="button" className="primary" onClick={() => void navigate(`/recipes/${recipe.id}`)}>
          Done
        </button>
      </div>

      <p className="muted" style={{ marginTop: '-0.75rem', marginBottom: '1.5rem' }}>
        Ingredients, equipment, and steps save as you change them. The details below need the Save button.
      </p>

      <div className="stack">
        <form className="card editor-section" onSubmit={(event) => void saveScalars(event)}>
          <RecipeFields value={scalars} onChange={setScalars} />
          {updateRecipe.error && (
            <p className="error-box" style={{ marginTop: '1rem' }}>
              {describeError(updateRecipe.error)}
            </p>
          )}
          <div className="editor-actions" style={{ marginTop: '1rem' }}>
            <button type="submit" className="primary" disabled={!isDirty || updateRecipe.isPending}>
              {updateRecipe.isPending ? 'Saving…' : 'Save details'}
            </button>
            {isDirty && <span className="muted">Unsaved changes</span>}
          </div>
        </form>

        <IngredientsSection recipe={recipe} />
        <TextChildSection
          title="You’ll need"
          items={recipe.requirements.map((item) => ({ id: item.id, text: item.name }))}
          placeholder="Large pot"
          emptyHint="No equipment listed."
          addLabel="+ Add item"
          multiline={false}
          onCreate={createRequirement.mutateAsync}
          onUpdate={updateRequirement.mutateAsync}
          onDelete={deleteRequirement.mutateAsync}
          toBody={(text) => ({ name: text })}
        />
        <TextChildSection
          title="Method"
          items={recipe.steps.map((item) => ({ id: item.id, text: item.text }))}
          placeholder="Describe this step…"
          emptyHint="No steps yet."
          addLabel="+ Add step"
          multiline
          onCreate={createStep.mutateAsync}
          onUpdate={updateStep.mutateAsync}
          onDelete={deleteStep.mutateAsync}
          toBody={(text) => ({ text })}
        />
      </div>
    </>
  )
}

function toScalars(recipe: Recipe): RecipeScalars {
  return {
    name: recipe.name,
    cookbook_id: recipe.cookbook_id ?? null,
    cookbook_page: recipe.cookbook_page ?? null,
    active_cook_time: recipe.active_cook_time ?? null,
    inactive_cook_time: recipe.inactive_cook_time ?? null,
    servings: recipe.servings ?? null,
  }
}

/* -------------------------------------------------------------------------- */

function IngredientsSection({ recipe }: { recipe: Recipe }) {
  const createIngredient = useCreateRecipeIngredient(recipe.id)
  const updateIngredient = useUpdateRecipeIngredient(recipe.id)
  const deleteIngredient = useDeleteRecipeIngredient(recipe.id)

  // Rows being edited, keyed by the recipe-ingredient id. A row is absent until
  // it is touched, so server updates flow straight through to untouched rows.
  const [drafts, setDrafts] = useState<Record<number, IngredientDraft>>({})
  const [newRow, setNewRow] = useState<IngredientDraft | null>(null)
  const error = createIngredient.error ?? updateIngredient.error ?? deleteIngredient.error

  return (
    <section className="card editor-section">
      <h2 className="section-heading">Ingredients</h2>

      {recipe.recipe_ingredients.length === 0 && newRow === null && <p className="empty-hint">No ingredients yet.</p>}

      {recipe.recipe_ingredients.map((item, index) => {
        const saved: IngredientDraft = {
          ingredient_id: item.ingredient.id,
          measurement_id: item.measurement.id,
          preparation_id: item.preparation.id,
          amount: item.amount,
        }
        const draft = drafts[item.id] ?? saved
        const dirty = JSON.stringify(draft) !== JSON.stringify(saved)

        return (
          <div key={item.id} className="child-row">
            <span className="child-row__index">{index + 1}</span>
            <IngredientFields
              value={draft}
              onChange={(next) => setDrafts((current) => ({ ...current, [item.id]: next }))}
            />
            <div className="row" style={{ paddingTop: '1.4rem' }}>
              {dirty && (
                <button
                  type="button"
                  onClick={() => {
                    if (!isComplete(draft)) return
                    // mutate(), not mutateAsync(): a failure shows through updateIngredient.error
                    // and keeps the draft, rather than escaping as an unhandled rejection.
                    updateIngredient.mutate(
                      { id: item.id, patch: draft },
                      {
                        onSuccess: () =>
                          setDrafts((current) => {
                            const { [item.id]: _discarded, ...rest } = current
                            return rest
                          }),
                      },
                    )
                  }}
                  disabled={!isComplete(draft) || updateIngredient.isPending}
                >
                  Save
                </button>
              )}
              <button
                type="button"
                className="ghost"
                aria-label={`Remove ingredient ${index + 1}`}
                onClick={() => deleteIngredient.mutate(item.id)}
              >
                ✕
              </button>
            </div>
          </div>
        )
      })}

      {newRow !== null && (
        <div className="child-row">
          <span className="child-row__index">+</span>
          <IngredientFields value={newRow} onChange={setNewRow} />
          <div className="row" style={{ paddingTop: '1.4rem' }}>
            <button
              type="button"
              className="primary"
              disabled={!isComplete(newRow) || createIngredient.isPending}
              onClick={() => {
                if (!isComplete(newRow)) return
                createIngredient.mutate(newRow, { onSuccess: () => setNewRow(null) })
              }}
            >
              Add
            </button>
            <button
              type="button"
              className="ghost"
              disabled={createIngredient.isPending}
              onClick={() => {
                setNewRow(null)
                createIngredient.reset() // its error refers to the row being discarded
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="error-box" style={{ marginTop: '0.75rem' }}>
          {describeError(error)}
        </p>
      )}

      {newRow === null && (
        <button type="button" style={{ marginTop: '0.75rem' }} onClick={() => setNewRow(emptyIngredient)}>
          + Add ingredient
        </button>
      )}
    </section>
  )
}

/* -------------------------------------------------------------------------- */

interface TextChild {
  id: number
  text: string
}

interface TextChildSectionProps<TBody> {
  title: string
  items: TextChild[]
  placeholder: string
  emptyHint: string
  addLabel: string
  multiline: boolean
  toBody: (text: string) => TBody
  onCreate: (body: TBody) => Promise<unknown>
  onUpdate: (args: { id: number; patch: TBody }) => Promise<unknown>
  onDelete: (id: number) => Promise<unknown>
}

/**
 * Steps and requirements are both "a list of one text field", so they share an
 * editor. Existing rows save on blur; a new row is added through its own input.
 */
function TextChildSection<TBody>({
  title,
  items,
  placeholder,
  emptyHint,
  addLabel,
  multiline,
  toBody,
  onCreate,
  onUpdate,
  onDelete,
}: TextChildSectionProps<TBody>) {
  const [drafts, setDrafts] = useState<Record<number, string>>({})
  const [newText, setNewText] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Only the Add button uses this; a blur save or delete must not disable it.
  const [creating, setCreating] = useState(false)
  const hintId = useId()

  // Resolves false on failure, so callers keep the typed text for a retry.
  async function run(action: () => Promise<unknown>) {
    setError(null)
    try {
      await action()
      return true
    } catch (caught) {
      setError(describeError(caught))
      return false
    }
  }

  // Matches what commit() would send: blank or unchanged drafts are discarded.
  function isUnsaved(item: TextChild) {
    const trimmed = drafts[item.id]?.trim()
    return trimmed !== undefined && trimmed !== '' && trimmed !== item.text
  }

  async function commit(item: TextChild) {
    const draft = drafts[item.id]
    if (draft === undefined) return

    const trimmed = draft.trim()
    // Both columns are non-nullable; an emptied field reverts rather than
    // sending a value the API would reject.
    if (trimmed === '' || trimmed === item.text) {
      setDrafts((current) => {
        const { [item.id]: _discarded, ...rest } = current
        return rest
      })
      return
    }

    if (!(await run(() => onUpdate({ id: item.id, patch: toBody(trimmed) })))) return
    setDrafts((current) => {
      // Text typed while the save was in flight hasn't been sent; keep it.
      if (current[item.id]?.trim() !== trimmed) return current
      const { [item.id]: _discarded, ...rest } = current
      return rest
    })
  }

  function field(
    value: string,
    onValueChange: (next: string) => void,
    extra: { onBlur?: () => void; autoFocus?: boolean; readOnly?: boolean; 'aria-describedby'?: string } = {},
  ) {
    const shared = {
      value,
      placeholder,
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        onValueChange(event.target.value),
      ...extra,
    }
    return multiline ? <textarea {...shared} /> : <input type="text" {...shared} />
  }

  return (
    <section className="card editor-section">
      <h2 className="section-heading">{title}</h2>

      {items.length === 0 && newText === null && <p className="empty-hint">{emptyHint}</p>}

      {items.map((item, index) => (
        <div key={item.id} className="child-row">
          <span className="child-row__index">{index + 1}</span>
          <div className="child-row__body">
            {field(
              drafts[item.id] ?? item.text,
              (next) => setDrafts((current) => ({ ...current, [item.id]: next })),
              {
                onBlur: () => void commit(item),
                'aria-describedby': isUnsaved(item) ? `${hintId}-${item.id}` : undefined,
              },
            )}
            {/* Shows while typing, and stays after a failed save once the error box clears. */}
            {isUnsaved(item) && (
              <span id={`${hintId}-${item.id}`} className="muted">
                Unsaved
              </span>
            )}
          </div>
          <button
            type="button"
            className="ghost"
            aria-label={`Remove ${title} entry ${index + 1}`}
            onClick={() => void run(() => onDelete(item.id))}
          >
            ✕
          </button>
        </div>
      ))}

      {newText !== null && (
        <div className="child-row">
          <span className="child-row__index">+</span>
          <div className="child-row__body">{/* Read-only while adding: text typed then would become a second step. */}
          {field(newText, setNewText, { autoFocus: true, readOnly: creating })}</div>
          <div className="row">
            <button
              type="button"
              className="primary"
              disabled={newText.trim() === '' || creating}
              onClick={async () => {
                setCreating(true)
                const saved = await run(() => onCreate(toBody(newText.trim())))
                setCreating(false)
                if (saved) setNewText(null)
              }}
            >
              Add
            </button>
            <button type="button" className="ghost" disabled={creating} onClick={() => setNewText(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="error-box" style={{ marginTop: '0.75rem' }}>
          {error}
        </p>
      )}

      {newText === null && (
        <button type="button" style={{ marginTop: '0.75rem' }} onClick={() => setNewText('')}>
          {addLabel}
        </button>
      )}
    </section>
  )
}
