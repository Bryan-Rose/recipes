import { useEffect, useId, useRef, useState } from 'react'

import { findByName } from '../api/lookups'
import { describeError } from '../api/errors'
import type { Lookup } from '../api/types'

interface LookupPickerProps<T extends Lookup> {
  label: string
  options: readonly T[] | undefined
  value: number | null
  onChange: (id: number | null) => void
  onCreate: (name: string) => Promise<T>
  disabled?: boolean
  /** Makes the field optional: this label becomes a selectable "nothing picked" option. */
  noneLabel?: string
  /** A name to create on save (from an import), shown while nothing is picked. */
  pendingName?: string
}

/**
 * A <select> over one of the lookup tables, with an inline "add new" that
 * creates the row and selects it.
 *
 * Names are unique, and posting an existing one returns 409. Matching against
 * the already-loaded list first turns that into simply selecting the existing row.
 */
export function LookupPicker<T extends Lookup>({
  label,
  options,
  value,
  onChange,
  onCreate,
  disabled,
  noneLabel,
  pendingName,
}: LookupPickerProps<T>) {
  const [isAdding, setIsAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const selectId = useId()
  // Bumped by reset() (Cancel, Escape, a finished save) and on unmount: a create resolving after either must not pick, here or in a row that replaced this one.
  const attempt = useRef(0)
  useEffect(
    () => () => {
      attempt.current += 1
    },
    [],
  )

  async function commit() {
    const name = draft.trim()
    if (name === '' || isSaving) return // Enter bypasses the disabled Add

    const existing = findByName(options, name)
    if (existing) {
      onChange(existing.id)
      reset()
      return
    }

    const current = attempt.current
    setIsSaving(true)
    setError(null)
    try {
      const created = await onCreate(name)
      if (attempt.current !== current) return
      onChange(created.id)
      reset()
    } catch (caught) {
      if (attempt.current === current) setError(describeError(caught))
    } finally {
      if (attempt.current === current) setIsSaving(false) // reset() already cleared it for an abandoned one
    }
  }

  function reset() {
    attempt.current += 1
    setIsSaving(false)
    setDraft('')
    setIsAdding(false)
    setError(null)
  }

  return (
    <div className="field">
      <label htmlFor={selectId}>{label}</label>
      <select
        id={selectId}
        value={value ?? ''}
        disabled={disabled || options === undefined}
        onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))}
      >
        <option value="" disabled={noneLabel === undefined}>
          {options === undefined ? 'Loading…' : (noneLabel ?? `Select ${label.toLowerCase()}…`)}
        </option>
        {options?.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>

      {value === null && pendingName && (
        <p className="muted picker__pending">
          New: “{pendingName}”, added when you save.{' '}
          <button type="button" className="ghost" onClick={() => onChange(null)} disabled={disabled}>
            Don’t add
          </button>
        </p>
      )}

      {isAdding ? (
        <div className="picker__create">
          <input
            type="text"
            autoFocus
            aria-label={`New ${label.toLowerCase()} name`}
            value={draft}
            placeholder={`New ${label.toLowerCase()}`}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void commit()
              }
              if (event.key === 'Escape') reset()
            }}
          />
          <div className="row" style={{ marginTop: '0.3rem' }}>
            <button type="button" onClick={() => void commit()} disabled={isSaving || draft.trim() === ''}>
              {isSaving ? 'Adding…' : 'Add'}
            </button>
            <button type="button" className="ghost" onClick={reset}>
              Cancel
            </button>
          </div>
          {error && (
            <p className="error-box" style={{ marginTop: '0.4rem' }}>
              {error}
            </p>
          )}
        </div>
      ) : (
        <button type="button" className="ghost picker__create" onClick={() => setIsAdding(true)} disabled={disabled}>
          + New {label.toLowerCase()}
        </button>
      )}
    </div>
  )
}
