import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'

import App from '../App'
import type { Recipe } from '../api/types'
import { renderWithProviders } from '../test/render'
import { server, signedIn } from '../test/server'

const cup = { id: 1, name: 'cup' }
const recipe: Recipe = {
  id: 7,
  name: 'Pancakes',
  servings: 4,
  created_user_id: 1,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  steps: [],
  requirements: [],
  tags: [],
  recipe_ingredients: [
    { id: 1, amount_numerator: 1, amount_denominator: 2, ingredient: { id: 1, name: 'milk' }, measurement: cup, preparation: null },
    { id: 2, amount_numerator: 1, amount_denominator: 3, ingredient: { id: 2, name: 'sugar' }, measurement: cup, preparation: null },
  ],
}

const amounts = () => within(screen.getByRole('list')).getAllByRole('listitem').map((item) => item.textContent)

function show(data: Recipe) {
  server.use(http.get('/api/recipes/7', () => HttpResponse.json(data)))
  renderWithProviders(<App />, { route: '/recipes/7' })
}

describe('serving scaler', () => {
  beforeEach(() => signedIn())

  it('scales amounts to the servings typed', async () => {
    const user = userEvent.setup()
    show(recipe)

    const box = await screen.findByLabelText('Servings')
    expect(amounts()).toEqual(['½ cup milk', '⅓ cup sugar'])

    await user.clear(box)
    await user.type(box, '8')
    expect(amounts()).toEqual(['1 cup milk', '⅔ cup sugar'])
  })

  it('steps servings and marks rounded amounts', async () => {
    const user = userEvent.setup()
    show(recipe)

    await user.click(await screen.findByRole('button', { name: 'More servings' }))
    expect(screen.getByLabelText('Servings')).toHaveValue(5)
    // ½ × 5/4 = ⅝ exactly; ⅓ × 5/4 = 5/12, rounded to ⅜
    expect(amounts()).toEqual(['⅝ cup milk', '≈⅜ cup sugar'])
  })

  it('shows unscaled amounts while the box is empty', async () => {
    const user = userEvent.setup()
    show(recipe)

    await user.clear(await screen.findByLabelText('Servings'))
    expect(amounts()).toEqual(['½ cup milk', '⅓ cup sugar'])
  })

  it('has no scaler without servings', async () => {
    show({ ...recipe, servings: null })

    expect(await screen.findByText('milk', { exact: false })).toBeInTheDocument()
    expect(screen.queryByLabelText('Servings')).not.toBeInTheDocument()
  })
})
