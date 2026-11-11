import { useState } from 'react'
import { Link } from 'react-router'

import { describeError } from '../api/errors'
import { useIngredients, useMeasurements, usePreparations } from '../api/lookups'
import { useImportText } from '../api/recipes'
import { fromImport } from '../components/drafts'
import { ErrorState, Loading } from '../components/Feedback'
import { CreateRecipeForm } from './CreateRecipeForm'

/** Paste a recipe, have Claude parse it, then review the draft beside the source before saving. */
export function ImportRecipe() {
  const [text, setText] = useState('')
  const importText = useImportText()
  const lists = [useIngredients(), useMeasurements(), usePreparations()]
  const [ingredient, measurement, preparation] = lists.map((list) => list.data)

  if (importText.data) {
    // Matching names to rows needs the lists; they load alongside the parse.
    const failed = lists.find((list) => list.error)?.error
    if (failed) return <ErrorState error={failed} what="lookups" />
    if (!ingredient || !measurement || !preparation) return <Loading what="lookups" />
    const { model, input_tokens, output_tokens, cost_usd } = importText.data.usage
    return (
      <div className="detail-columns">
        <aside className="card editor-section">
          <h2 className="section-heading">Source</h2>
          <p className="recipe-notes">{importText.variables}</p>
          <p className="muted">
            Read by {model}: {input_tokens.toLocaleString()} tokens in, {output_tokens.toLocaleString()} out, costing{' '}
            {cost_usd === null ? 'an unknown amount' : `$${cost_usd.toFixed(3)}`}.
          </p>
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
