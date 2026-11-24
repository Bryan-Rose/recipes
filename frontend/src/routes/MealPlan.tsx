import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'

import { describeError } from '../api/errors'
import { useAddMeal, useMealPlan, usePutMeal, useRemoveMeal, useShopMeals } from '../api/mealPlan'
import { useRecipes } from '../api/recipes'
import { addDays, isoDay, monday } from '../components/days'
import { ErrorState, Loading } from '../components/Feedback'

const parseDay = (iso: string | null) => {
  const [year, month, day] = (iso ?? '').split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return Number.isNaN(date.getTime()) ? null : date
}

const dayLabel = (date: Date) => date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })

/** The one plan everyone shares, a week at a time from Monday, with a button to shop for the week. */
export function MealPlan() {
  const [params, setParams] = useSearchParams()
  const start = monday(parseDay(params.get('week')) ?? new Date())
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  const [first, last] = [isoDay(days[0]), isoDay(days[6])]

  const { data: meals, isPending, error } = useMealPlan(first, last)
  const recipes = useRecipes()
  const addMeal = useAddMeal()
  const putMeal = usePutMeal()
  const removeMeal = useRemoveMeal()
  const shop = useShopMeals()
  const [recipeId, setRecipeId] = useState('')
  const [chosenDay, setDay] = useState(first)
  // A day chosen in another week (before Back, say) falls back to this week's Monday.
  const day = days.some((date) => isoDay(date) === chosenDay) ? chosenDay : first

  const goTo = (date: Date) => {
    setParams({ week: isoDay(date) })
    shop.reset()
  }

  if (isPending) return <Loading what="meal plan" />
  if (error) return <ErrorState error={error} what="the meal plan" />

  const failure = addMeal.error ?? putMeal.error ?? removeMeal.error ?? shop.error ?? recipes.error
  const sortedRecipes = [...(recipes.data ?? [])].sort((a, b) => a.name.localeCompare(b.name))

  return (
    <>
      <div className="page-header">
        <h1>Meal plan</h1>
        <button
          type="button"
          onClick={() => shop.mutate({ start: first, end: last })}
          disabled={meals.length === 0 || shop.isPending}
        >
          Add week to shopping list
        </button>
      </div>

      {failure && <p className="error-box">{describeError(failure)}</p>}
      {shop.isSuccess && (
        <p className="status">
          Added the week's meals to the <Link to="/shopping">shopping list</Link>.
        </p>
      )}

      <div className="row">
        <button type="button" className="ghost" onClick={() => goTo(addDays(start, -7))}>
          ← Previous week
        </button>
        <button type="button" className="ghost" onClick={() => goTo(monday(new Date()))}>
          This week
        </button>
        <button type="button" className="ghost" onClick={() => goTo(addDays(start, 7))}>
          Next week →
        </button>
      </div>

      <form
        className="row"
        onSubmit={(event) => {
          event.preventDefault()
          addMeal.mutate({ recipe_id: Number(recipeId), day, servings: null })
        }}
      >
        <label className="row">
          Recipe
          <select value={recipeId} onChange={(event) => setRecipeId(event.target.value)} required>
            <option value="">Choose a recipe</option>
            {sortedRecipes.map((recipe) => (
              <option key={recipe.id} value={recipe.id}>
                {recipe.name}
              </option>
            ))}
          </select>
        </label>
        <label className="row">
          Day
          <select value={day} onChange={(event) => setDay(event.target.value)}>
            {days.map((date) => (
              <option key={isoDay(date)} value={isoDay(date)}>
                {dayLabel(date)}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={addMeal.isPending}>
          Plan it
        </button>
      </form>

      {days.map((date) => {
        const label = dayLabel(date)
        const planned = meals.filter((meal) => meal.day === isoDay(date))
        return (
          <section key={label}>
            <h2 className="section-heading">{label}</h2>
            {planned.length === 0 ? (
              <p className="empty-hint">Nothing planned.</p>
            ) : (
              <ul className="ingredient-list" aria-label={`Meals on ${label}`}>
                {planned.map((meal) => (
                  <li key={meal.id}>
                    <div className="row">
                      <Link to={`/recipes/${meal.recipe_id}`}>{meal.name}</Link>
                      {meal.recipe_servings != null && (
                        <label className="row muted">
                          Servings
                          {/* Saved on leaving the box, like the shopping list's. */}
                          <input
                            key={meal.servings}
                            type="number"
                            min="1"
                            inputMode="numeric"
                            className="shopping-servings"
                            aria-label={`Servings of ${meal.name} on ${label}`}
                            defaultValue={meal.servings ?? meal.recipe_servings}
                            onBlur={(event) => {
                              const servings = Number(event.target.value)
                              if (!Number.isInteger(servings) || servings < 1)
                                event.target.value = String(meal.servings ?? meal.recipe_servings)
                              else if (servings !== (meal.servings ?? meal.recipe_servings)) putMeal.mutate({ id: meal.id, servings })
                            }}
                          />
                        </label>
                      )}
                      <button
                        type="button"
                        className="ghost"
                        aria-label={`Remove ${meal.name} from ${label}`}
                        onClick={() => removeMeal.mutate(meal.id)}
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )
      })}
    </>
  )
}
