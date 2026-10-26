import { useCookbooks } from '../api/lookups'
import type { RecipeScalars } from './drafts'

interface RecipeFieldsProps {
  value: RecipeScalars
  onChange: (next: RecipeScalars) => void
}

export function RecipeFields({ value, onChange }: RecipeFieldsProps) {
  const { data: cookbooks } = useCookbooks()

  function set<K extends keyof RecipeScalars>(key: K, next: RecipeScalars[K]) {
    onChange({ ...value, [key]: next })
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
            onChange={(event) => set('cookbook_id', event.target.value === '' ? null : Number(event.target.value))}
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
            type="text"
            value={value.servings ?? ''}
            onChange={(event) => set('servings', orNull(event.target.value))}
            placeholder="4"
          />
        </div>

        <div className="field">
          <label htmlFor="recipe-active">Active time</label>
          <input
            id="recipe-active"
            type="text"
            value={value.active_cook_time ?? ''}
            onChange={(event) => set('active_cook_time', orNull(event.target.value))}
            placeholder="20 minutes"
          />
        </div>

        <div className="field">
          <label htmlFor="recipe-inactive">Inactive time</label>
          <input
            id="recipe-inactive"
            type="text"
            value={value.inactive_cook_time ?? ''}
            onChange={(event) => set('inactive_cook_time', orNull(event.target.value))}
            placeholder="1 hour resting"
          />
        </div>
      </div>
    </div>
  )
}
