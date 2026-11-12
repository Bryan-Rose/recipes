import { useState } from 'react'
import { Link, Navigate } from 'react-router'

import { useAuthConfig } from '../api/auth'
import { describeError } from '../api/errors'
import { useIngredients, useMeasurements, usePreparations } from '../api/lookups'
import { useImportRecipe } from '../api/recipes'
import { fromImport } from '../components/drafts'
import { ErrorState, Loading } from '../components/Feedback'
import { jpegUrl, toJpeg } from '../components/photos'
import { CreateRecipeForm } from './CreateRecipeForm'

// PhotoImport.photos' max_length in backend/app/schemas/imports.py.
const MAX_PHOTOS = 4

/** Paste a recipe, photograph its pages or link to it, have Claude parse it, then review the draft beside the source before saving. */
export function ImportRecipe() {
  const [text, setText] = useState('')
  const [url, setUrl] = useState('')
  const [photos, setPhotos] = useState<string[]>([])
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [converting, setConverting] = useState(false)
  const importRecipe = useImportRecipe()
  const lists = [useIngredients(), useMeasurements(), usePreparations()]
  const [ingredient, measurement, preparation] = lists.map((list) => list.data)
  const importEnabled = useAuthConfig().data?.recipe_import
  // A deep link while import is off would only end in a 503.
  if (importEnabled === false) return <Navigate to="/" replace />

  if (importRecipe.data && importRecipe.variables) {
    // Matching names to rows needs the lists; they load alongside the parse.
    const failed = lists.find((list) => list.error)?.error
    if (failed) return <ErrorState error={failed} what="lookups" />
    if (!ingredient || !measurement || !preparation) return <Loading what="lookups" />
    const source = importRecipe.variables
    const { model, input_tokens, output_tokens, cost_usd } = importRecipe.data.usage
    return (
      <div className="detail-columns">
        <aside className="card editor-section">
          <h2 className="section-heading">Source</h2>
          {'text' in source && <p className="recipe-notes">{source.text}</p>}
          {'photos' in source &&
            source.photos.map((photo, index) => (
              <img key={index} className="import-photo" src={jpegUrl(photo)} alt={`Page ${index + 1}`} />
            ))}
          {'url' in source && (
            <p className="recipe-notes">
              <a href={source.url} target="_blank" rel="noreferrer">
                {source.url}
              </a>
            </p>
          )}
          <p className="muted">
            Read by {model}: {input_tokens.toLocaleString()} tokens in, {output_tokens.toLocaleString()} out, costing{' '}
            {cost_usd === null ? 'an unknown amount' : `$${cost_usd.toFixed(3)}`}.
          </p>
          {/* Back to the source with it kept; changes made in the review are dropped. */}
          <button type="button" className="ghost" onClick={() => importRecipe.reset()}>
            {'text' in source ? 'Edit text' : 'photos' in source ? 'Change photos' : 'Edit link'}
          </button>
        </aside>
        <CreateRecipeForm
          initial={fromImport(importRecipe.data, { ingredient, measurement, preparation }, 'url' in source ? source.url : null)}
          heading="Review import"
        />
      </div>
    )
  }

  async function addPhotos(files: File[]) {
    setPhotoError(null)
    if (photos.length + files.length > MAX_PHOTOS) {
      setPhotoError(`One recipe takes up to ${MAX_PHOTOS} photos.`)
      return
    }
    setConverting(true)
    // Keep the photos that convert, so one bad file doesn't mean picking the rest again.
    const results = await Promise.allSettled(files.map((file) => toJpeg(file)))
    setConverting(false)
    setPhotos((current) => [...current, ...results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))])
    const failed = files.filter((_, index) => results[index].status === 'rejected').map((file) => file.name)
    if (failed.length > 0) setPhotoError(`Couldn’t open ${failed.join(', ')}. Try a JPEG or PNG.`)
  }

  const busy = importRecipe.isPending || converting
  return (
    <>
      <p style={{ marginTop: 0 }}>
        <Link to="/">← All recipes</Link>
      </p>
      <div className="page-header">
        <h1>Import a recipe</h1>
      </div>
      <form
        className="card editor-section stack"
        onSubmit={(event) => {
          event.preventDefault()
          importRecipe.mutate({ text })
        }}
      >
        <div className="field">
          <label htmlFor="import-text">Recipe text</label>
          <textarea
            id="import-text"
            rows={12}
            // TextImport.text's max_length in backend/app/schemas/imports.py.
            maxLength={20_000}
            value={text}
            disabled={busy}
            placeholder="Paste a recipe: title, ingredients and method."
            onChange={(event) => setText(event.target.value)}
          />
        </div>
        <div className="editor-actions">
          <button type="submit" className="primary" disabled={busy || text.trim() === ''}>
            Read recipe
          </button>
        </div>
      </form>
      <form
        className="card editor-section stack"
        style={{ marginTop: '1rem' }}
        onSubmit={(event) => {
          event.preventDefault()
          importRecipe.mutate({ photos })
        }}
      >
        <div className="field">
          <label htmlFor="import-photos">Or photos of the pages, in order (up to {MAX_PHOTOS})</label>
          <input
            id="import-photos"
            type="file"
            accept="image/*"
            multiple
            disabled={busy || photos.length >= MAX_PHOTOS}
            onChange={(event) => {
              void addPhotos(Array.from(event.target.files ?? []))
              event.target.value = ''
            }}
          />
        </div>
        {photos.length > 0 && (
          <div className="import-photos">
            {photos.map((photo, index) => (
              <img key={index} className="import-photo" src={jpegUrl(photo)} alt={`Page ${index + 1}`} />
            ))}
          </div>
        )}
        {photoError && <p className="error-box">{photoError}</p>}
        <div className="editor-actions">
          <button type="submit" className="primary" disabled={busy || photos.length === 0}>
            Read photos
          </button>
          {photos.length > 0 && (
            <button type="button" className="ghost" disabled={busy} onClick={() => {
                setPhotos([])
                setPhotoError(null)
              }}>
              Clear photos
            </button>
          )}
        </div>
      </form>
      <form
        className="card editor-section stack"
        style={{ marginTop: '1rem' }}
        onSubmit={(event) => {
          event.preventDefault()
          importRecipe.mutate({ url: url.trim() })
        }}
      >
        <div className="field">
          <label htmlFor="import-url">Or a link to the recipe</label>
          <input
            id="import-url"
            type="url"
            // UrlImport.url's max_length in backend/app/schemas/imports.py.
            maxLength={2_000}
            value={url}
            disabled={busy}
            placeholder="https://"
            onChange={(event) => setUrl(event.target.value)}
          />
        </div>
        <div className="editor-actions">
          <button type="submit" className="primary" disabled={busy || url.trim() === ''}>
            Read link
          </button>
        </div>
      </form>
      {importRecipe.error && <p className="error-box">{describeError(importRecipe.error)}</p>}
      {converting && <p className="muted">Preparing photos…</p>}
      {importRecipe.isPending && <p className="muted">Reading recipe… This can take up to a minute.</p>}
    </>
  )
}
