import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'

import type { Recipe } from '../api/types'
import { renderWithProviders } from '../test/render'
import { server } from '../test/server'
import { EditRecipeForm } from './EditRecipeForm'

const recipe: Recipe = {
  id: 7,
  name: 'Soup',
  created_user_id: 1,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  steps: [{ id: 3, text: 'Boil water' }],
  requirements: [],
  recipe_ingredients: [],
  tags: [],
}

const failure = () => HttpResponse.json({ detail: 'Server unavailable' }, { status: 503 })

describe('recipe editor when a save fails', () => {
  beforeEach(() => {
    server.use(http.get('/api/cookbooks/', () => HttpResponse.json([])))
  })

  it('keeps the text of a new step', async () => {
    server.use(http.post('/api/recipes/7/steps/', failure))
    const user = userEvent.setup()
    renderWithProviders(<EditRecipeForm recipe={recipe} />)

    await user.click(screen.getByRole('button', { name: '+ Add step' }))
    await user.keyboard('Add salt') // the new step's field is autofocused
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByText(/Server unavailable/)).toBeInTheDocument()
    expect(screen.getByDisplayValue('Add salt')).toBeInTheDocument()
  })

  it('keeps an edit to an existing step', async () => {
    server.use(http.patch('/api/recipes/7/steps/3', failure))
    const user = userEvent.setup()
    renderWithProviders(<EditRecipeForm recipe={recipe} />)

    await user.type(screen.getByDisplayValue('Boil water'), ' fast')
    await user.tab()

    expect(await screen.findByText(/Server unavailable/)).toBeInTheDocument()
    expect(screen.getByDisplayValue('Boil water fast')).toBeInTheDocument()
  })
})
