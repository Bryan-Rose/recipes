import { useState } from 'react'
import { Link } from 'react-router'

import { describeError } from '../api/errors'
import { useIngredients, useMeasurements, usePreparations } from '../api/lookups'
import { useImportText } from '../api/recipes'
import { fromImport } from '../components/drafts'
import { Loading } from '../components/Feedback'
import { CreateRecipeForm } from './CreateRecipeForm'

/** Paste a recipe, have Claude parse it, then review the draft beside the source before saving. */
export function ImportRecipe() {
  const [text, setText] = useState('')
  const importText = useImportText()
  const ingredient = useIngredients().data
  const measurement = useMeasurements().data
  const preparation = usePreparations().data

  if (importText.data) {
    // Matching names to rows needs the lists; they load alongside the parse.
    if (!ingredient || !measurement || !preparation) return <Loading what="lookups" />
    return (
      <div className="detail-columns">
        <aside className="card editor-section">
          <h2 className="section-heading">Source</h2>
          <p className="recipe-notes">{importText.variables}</p>
        </aside>
        <CreateRecipeForm
          initial={fromImport(importText.data, { ingredient, measurement, preparation })}
          heading="Review import"
        />
      </div>
    )
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        importText.mutate(text)
      }}
    >
      <p style={{ marginTop: 0 }}>
        <Link to="/">← All recipes</Link>
      </p>
      <div className="page-header">
        <h1>Import a recipe</h1>
      </div>
      <section className="card editor-section stack">
        <div className="field">
          <label htmlFor="import-text">Recipe text</label>
          <textarea
            id="import-text"
            rows={16}
            value={text}
            disabled={importText.isPending}
            placeholder="Paste a recipe: title, ingredients and method."
            onChange={(event) => setText(event.target.value)}
          />
        </div>
        {importText.error && <p className="error-box">{describeError(importText.error)}</p>}
        <div className="editor-actions">
          <button type="submit" className="primary" disabled={importText.isPending || text.trim() === ''}>
            {importText.isPending ? 'Reading recipe…' : 'Read recipe'}
          </button>
          {importText.isPending && <span className="muted">This can take up to a minute.</span>}
        </div>
      </section>
    </form>
  )
}
