import { Link, useParams } from 'react-router'

import { useImport } from '../api/recipes'
import { OUTCOME, SOURCE } from '../components/cost'
import { ErrorState, Loading } from '../components/Feedback'

/** What one import sent to Claude, to check a recipe against what it was read from. */
export function ImportOriginal() {
  const { importId } = useParams()
  const id = Number(importId)
  const { data: row, isPending, error } = useImport(id)
  if (isPending) return <Loading what="import" />
  if (error) return <ErrorState error={error} what="import" />

  const file = (part: number) => `/api/imports/${id}/original/${part}`
  return (
    <div className="stack">
      <p style={{ marginTop: 0 }}>
        <Link to="/import-costs">← Import costs</Link>
      </p>
      <div className="page-header">
        <h1>Original import</h1>
      </div>
      <p className="muted">
        {SOURCE[row.source]}, {new Date(row.created_at).toLocaleString()}:{' '}
        {row.recipe ? (
          <Link to={`/recipes/${row.recipe.id}`}>{row.recipe.name}</Link>
        ) : row.saved ? (
          'recipe deleted'
        ) : (
          OUTCOME[row.outcome].toLowerCase()
        )}
      </p>
      {row.original_parts === 0 ? (
        <p className="muted">This import is from before originals were kept.</p>
      ) : row.source === 'text' ? (
        <pre className="card original-text">{row.text}</pre>
      ) : row.source === 'photos' ? (
        Array.from({ length: row.original_parts }, (_, part) => (
          <img key={part} className="card original-photo" src={file(part)} alt={`Page ${part + 1}`} />
        ))
      ) : (
        <p>
          Fetched from{' '}
          <a href={row.page_url ?? undefined} target="_blank" rel="noreferrer">
            {row.page_url}
          </a>
          .{' '}
          <a href={file(0)} target="_blank" rel="noreferrer">
            The page's HTML
          </a>
          , as downloaded, opens as text.
        </p>
      )}
    </div>
  )
}
