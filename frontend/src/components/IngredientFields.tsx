import { useId } from 'react'

import {
  useCreateIngredient,
  useCreateMeasurement,
  useCreatePreparation,
  useIngredients,
  useMeasurements,
  usePreparations,
} from '../api/lookups'
import { FRACTIONS, splitAmount } from './amount'
import type { IngredientDraft } from './drafts'
import { LookupPicker } from './LookupPicker'

interface IngredientFieldsProps {
  value: IngredientDraft
  onChange: (next: IngredientDraft) => void
  disabled?: boolean
}

export function IngredientFields({ value, onChange, disabled }: IngredientFieldsProps) {
  const amountId = useId()
  const { whole, fraction } = splitAmount(value.amount_numerator, value.amount_denominator)
  const ingredients = useIngredients()
  const measurements = useMeasurements()
  const preparations = usePreparations()

  const createIngredient = useCreateIngredient()
  const createMeasurement = useCreateMeasurement()
  const createPreparation = useCreatePreparation()

  function set<K extends keyof IngredientDraft>(key: K, next: IngredientDraft[K]) {
    onChange({ ...value, [key]: next })
  }

  function setAmount(nextWhole: number, nextFraction: number) {
    const [n, d] = nextFraction === -1 ? [0, 1 as const] : FRACTIONS[nextFraction]
    onChange({ ...value, amount_numerator: nextWhole * d + n, amount_denominator: d })
  }

  return (
    <div className="ingredient-fields">
      <div className="field">
        <label htmlFor={amountId}>Amount</label>
        <div className="amount-fields">
          <input
            id={amountId}
            type="number"
            inputMode="numeric"
            min="0"
            step="1"
            placeholder="0"
            // Empty means 0, for "½ cup".
            value={whole || ''}
            disabled={disabled}
            onChange={(event) => setAmount(Math.max(0, Math.floor(Number(event.target.value) || 0)), fraction)}
          />
          <select
            aria-label="Fraction"
            value={fraction}
            disabled={disabled}
            onChange={(event) => setAmount(whole, Number(event.target.value))}
          >
            <option value={-1}>—</option>
            {FRACTIONS.map(([, , glyph], index) => (
              <option key={glyph} value={index}>
                {glyph}
              </option>
            ))}
          </select>
        </div>
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
        noneLabel="None"
      />
    </div>
  )
}
