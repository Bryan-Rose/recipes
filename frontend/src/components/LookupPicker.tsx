import { useState } from 'react'

import { findByName } from '../api/lookups'
import { describeError } from '../api/errors'
import type { Lookup } from '../api/types'

interface LookupPickerProps<T extends Lookup> {
  label: string
  options: readonly T[] | undefined
  value: number | null
  onChange: (id: number) => void
  onCreate: (name: string) => Promise<T>
  disabled?: boolean
}

/**
 * A <select> over one of the lookup tables, with an inline "add new" that
 * creates the row and selects it.
 *
 * The duplicate check before creating is not just a nicety: these names are
 * unique in the database but no handler catches IntegrityError, so posting an
 * existing name returns an unhandled 500. Matching against the already-loaded
 * list turns that into simply selecting the row that exists.
 */
export function LookupPicker<T extends Lookup>({
  label,
  options,
  value,
  onChange,
  onCreate,
  disabled,
}: LookupPickerProps<T>) {
  const [isAdding, setIsAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  async function commit() {
    const name = draft.trim()
    if (name === '') return

    const existing = findByName(options, name)
    if (existing) {
      onChange(existing.id)
      reset()
      return
    }

    setIsSaving(true)
    setError(null)
    try {
      const created = await onCreate(name)
      onChange(created.id)
      reset()
    } catch (caught) {
      setError(describeError(caught))
    } finally {
      setIsSaving(false)
    }
  }

  function reset() {
    setDraft('')
    setIsAdding(false)
    setError(null)
  }

  return (
    <div className="field">
      <label>{label}</label>
      <select
        value={value ?? ''}
        disabled={disabled || options === undefined}
        onChange={(event) => onChange(Number(event.target.value))}
      >
        <option value="" disabled>
          {options === undefined ? 'Loading…' : `Select ${label.toLowerCase()}…`}
        </option>
        {options?.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>

      {isAdding ? (
        <div className="picker__create">
          <input
            type="text"
            autoFocus
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
