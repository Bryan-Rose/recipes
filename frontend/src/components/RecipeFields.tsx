import type { Dispatch, SetStateAction } from 'react'

import { useCookbooks, useCreateTag, useTags } from '../api/lookups'
import type { RecipeScalars } from './drafts'
import { LookupPicker } from './LookupPicker'

interface RecipeFieldsProps {
  value: RecipeScalars
  /** A state setter: updates read the latest value, so a tag created mid-edit can't undo typing. */
  onChange: Dispatch<SetStateAction<RecipeScalars>>
}

export function RecipeFields({ value, onChange }: RecipeFieldsProps) {
  const { data: cookbooks } = useCookbooks()
  const { data: tags } = useTags()
  const createTag = useCreateTag()

  function set<K extends keyof RecipeScalars>(key: K, next: RecipeScalars[K]) {
    onChange((current) => ({ ...current, [key]: next }))
  }

  function setCookbook(raw: string) {
    if (raw === '') {
      // The page input is disabled without a cookbook, so a kept page would be saved invisibly.
      onChange((current) => ({ ...current, cookbook_id: null, cookbook_page: null }))
    } else {
      set('cookbook_id', Number(raw))
    }
  }

  /** Empty inputs are sent as null, not "" — the columns are nullable. */
  const orNull = (raw: string) => (raw.trim() === '' ? null : raw)

  return (
    <div className="stack" style={{ gap: '1rem' }}>
      <div className="field">
        <label htmlFor="recipe-name">Name</label>
        <input
          id="recipe-name"
          type="text"
          required
          value={value.name}
          onChange={(event) => set('name', event.target.value)}
          placeholder="Spaghetti Carbonara"
        />
      </div>

      <div className="field-grid">
        <div className="field">
          <label htmlFor="recipe-cookbook">Cookbook</label>
          <select
            id="recipe-cookbook"
            value={value.cookbook_id ?? ''}
            onChange={(event) => setCookbook(event.target.value)}
          >
            <option value="">No cookbook</option>
            {cookbooks?.map((cookbook) => (
              <option key={cookbook.id} value={cookbook.id}>
                {cookbook.name} — {cookbook.author.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="recipe-page">Page</label>
          <input
            id="recipe-page"
            type="number"
            min="1"
            value={value.cookbook_page ?? ''}
            disabled={value.cookbook_id === null}
            onChange={(event) =>
              set('cookbook_page', event.target.value === '' ? null : Number(event.target.value))
            }
          />
        </div>

        <div className="field">
          <label htmlFor="recipe-servings">Servings</label>
          <input
            id="recipe-servings"
            type="number"
            min="1"
            value={value.servings ?? ''}
            onChange={(event) => set('servings', event.target.value === '' ? null : Number(event.target.value))}
            placeholder="4"
          />
        </div>

        <div className="field">
          <label htmlFor="recipe-active">Active time (minutes)</label>
          <input
            id="recipe-active"
            type="number"
            min="0"
            value={value.active_cook_time ?? ''}
            onChange={(event) => set('active_cook_time', event.target.value === '' ? null : Number(event.target.value))}
            placeholder="20"
          />
        </div>

        <div className="field">
          <label htmlFor="recipe-inactive">Inactive time (minutes)</label>
          <input
            id="recipe-inactive"
            type="number"
            min="0"
            value={value.inactive_cook_time ?? ''}
            onChange={(event) => set('inactive_cook_time', event.target.value === '' ? null : Number(event.target.value))}
            placeholder="60"
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor="recipe-source">Source URL</label>
        <input
          id="recipe-source"
          type="url"
          pattern="https?://.+"
          value={value.source_url ?? ''}
          onChange={(event) => set('source_url', orNull(event.target.value))}
          placeholder="https://example.com/recipe"
        />
      </div>

      <div>
        {/* Picking a tag adds it, so the picker always shows "Select tag…". It lists the picked tags
            too, so that typing an existing name as a new tag finds it instead of getting a 409. */}
        <LookupPicker
          label="Tag"
          options={tags}
          value={null}
          onChange={(id) =>
            onChange((current) =>
              id === null || current.tag_ids.includes(id)
                ? current
                : { ...current, tag_ids: [...current.tag_ids, id].sort((a, b) => a - b) },
            )
          }
          onCreate={(name) => createTag.mutateAsync(name)}
        />
        {value.tag_ids.length > 0 && (
          <ul className="tag-list" aria-label="Tags">
            {value.tag_ids
              .map((id) => ({ id, name: tags?.find((tag) => tag.id === id)?.name ?? '…' }))
              .sort((a, b) => a.name.localeCompare(b.name))
              .map(({ id, name }) => (
                <li key={id} className="tag">
                  {name}
                  <button
                    type="button"
                    className="ghost tag__remove"
                    aria-label={`Remove tag ${name}`}
                    onClick={() =>
                      onChange((current) => ({ ...current, tag_ids: current.tag_ids.filter((other) => other !== id) }))
                    }
                  >
                    ×
                  </button>
                </li>
              ))}
          </ul>
        )}
      </div>

      <div className="field">
        <label htmlFor="recipe-notes">Notes</label>
        <textarea
          id="recipe-notes"
          value={value.notes ?? ''}
          onChange={(event) => set('notes', orNull(event.target.value))}
          placeholder="Halve the salt"
        />
      </div>
    </div>
  )
}
