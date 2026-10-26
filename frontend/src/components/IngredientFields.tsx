import {
  useCreateIngredient,
  useCreateMeasurement,
  useCreatePreparation,
  useIngredients,
  useMeasurements,
  usePreparations,
} from '../api/lookups'
import type { IngredientDraft } from './drafts'
import { LookupPicker } from './LookupPicker'

interface IngredientFieldsProps {
  value: IngredientDraft
  onChange: (next: IngredientDraft) => void
  disabled?: boolean
}

export function IngredientFields({ value, onChange, disabled }: IngredientFieldsProps) {
  const ingredients = useIngredients()
  const measurements = useMeasurements()
  const preparations = usePreparations()

  const createIngredient = useCreateIngredient()
  const createMeasurement = useCreateMeasurement()
  const createPreparation = useCreatePreparation()

  function set<K extends keyof IngredientDraft>(key: K, next: IngredientDraft[K]) {
    onChange({ ...value, [key]: next })
  }

  return (
    <div className="ingredient-fields">
      <div className="field">
        <label>Amount</label>
        <input
          type="number"
          min="1"
          step="1"
          value={value.amount}
          disabled={disabled}
          // amount is an Integer column — the backend rejects fractions, so
          // there is no way to express "½ cup" until that type changes.
          onChange={(event) => set('amount', Math.max(1, Math.round(Number(event.target.value) || 1)))}
        />
      </div>

      <LookupPicker
        label="Measurement"
        options={measurements.data}
        value={value.measurement_id}
        onChange={(id) => set('measurement_id', id)}
        onCreate={(name) => createMeasurement.mutateAsync(name)}
        disabled={disabled}
      />

      <LookupPicker
        label="Ingredient"
        options={ingredients.data}
        value={value.ingredient_id}
        onChange={(id) => set('ingredient_id', id)}
        onCreate={(name) => createIngredient.mutateAsync(name)}
        disabled={disabled}
      />

      <LookupPicker
        label="Preparation"
        options={preparations.data}
        value={value.preparation_id}
        onChange={(id) => set('preparation_id', id)}
        onCreate={(name) => createPreparation.mutateAsync(name)}
        disabled={disabled}
      />
    </div>
  )
}
