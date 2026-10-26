import { describeError } from '../api/errors'

export function Loading({ what }: { what: string }) {
  return <p className="status">Loading {what}…</p>
}

export function ErrorState({ error, what }: { error: unknown; what: string }) {
  return (
    <div className="status">
      <p className="error-box">
        Couldn&rsquo;t load {what}: {describeError(error)}
      </p>
      <p className="muted" style={{ marginTop: '1rem' }}>
        Is the API running on <code>localhost:8000</code>?
      </p>
    </div>
  )
}

