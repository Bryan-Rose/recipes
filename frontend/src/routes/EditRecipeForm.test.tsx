import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'

import App from '../App'
import type { Recipe } from '../api/types'
import { renderWithProviders } from '../test/render'
import { server, signedIn } from '../test/server'
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

  it('flags a step whose edit failed as unsaved, after the error clears', async () => {
    server.use(
      http.patch('/api/recipes/7/steps/3', failure),
      http.post('/api/recipes/7/steps/', () => HttpResponse.json({ id: 4, text: 'Add salt' }, { status: 201 })),
      http.get('/api/recipes/7', () => HttpResponse.json(recipe)),
      http.get('/api/recipes/', () => HttpResponse.json([recipe])),
    )
    const user = userEvent.setup()
    renderWithProviders(<EditRecipeForm recipe={recipe} />)

    await user.type(screen.getByDisplayValue('Boil water'), ' fast')
    await user.tab()
    expect(await screen.findByText(/Server unavailable/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '+ Add step' }))
    await user.keyboard('Add salt')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByRole('button', { name: '+ Add step' })).toBeInTheDocument()
    expect(screen.queryByText(/Server unavailable/)).not.toBeInTheDocument()
    expect(screen.getByDisplayValue('Boil water fast')).toHaveAccessibleDescription('Unsaved')
  })

  it('does not flag a step that differs only by whitespace', async () => {
    const user = userEvent.setup()
    renderWithProviders(<EditRecipeForm recipe={recipe} />)

    await user.type(screen.getByDisplayValue('Boil water'), ' ')
    expect(screen.queryByText('Unsaved')).not.toBeInTheDocument()
  })

  it('accepts an Add click that blurs an edited step', async () => {
    let posted: unknown
    server.use(
      http.patch('/api/recipes/7/steps/3', () => HttpResponse.json({ id: 3, text: 'Boil water fast' })),
      http.post('/api/recipes/7/steps/', async ({ request }) => {
        posted = await request.json()
        return HttpResponse.json({ id: 4, text: 'Add salt' }, { status: 201 })
      }),
      http.get('/api/recipes/7', () => HttpResponse.json(recipe)),
      http.get('/api/recipes/', () => HttpResponse.json([recipe])),
    )
    const user = userEvent.setup()
    renderWithProviders(<EditRecipeForm recipe={recipe} />)

    await user.click(screen.getByRole('button', { name: '+ Add step' }))
    await user.keyboard('Add salt')
    await user.type(screen.getByDisplayValue('Boil water'), ' fast')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    await expect.poll(() => posted).toEqual({ text: 'Add salt' })
  })

  it('disables Add while a step is saving', async () => {
    // Created before the request, so release() exists whenever the poll passes.
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    server.use(
      http.post('/api/recipes/7/steps/', async () => {
        await gate
        return failure()
      }),
    )
    const user = userEvent.setup()
    renderWithProviders(<EditRecipeForm recipe={recipe} />)

    await user.click(screen.getByRole('button', { name: '+ Add step' }))
    await user.keyboard('Add salt')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    await expect.poll(() => screen.getByRole('button', { name: 'Add' })).toBeDisabled()
    release()
    expect(await screen.findByText(/Server unavailable/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add' })).toBeEnabled()
  })

  it('makes a new step read-only while it is being added', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    server.use(
      http.post('/api/recipes/7/steps/', async () => {
        await gate
        return HttpResponse.json({ id: 4, text: 'Add salt' }, { status: 201 })
      }),
      http.get('/api/recipes/7', () => HttpResponse.json(recipe)),
      http.get('/api/recipes/', () => HttpResponse.json([recipe])),
    )
    const user = userEvent.setup()
    renderWithProviders(<EditRecipeForm recipe={recipe} />)

    await user.click(screen.getByRole('button', { name: '+ Add step' }))
    await user.keyboard('Add salt')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    const field = screen.getByDisplayValue('Add salt')
    await expect.poll(() => field).toHaveAttribute('readonly')
    await user.type(field, ' and pepper')
    expect(field).toHaveValue('Add salt')
    release()

    expect(await screen.findByRole('button', { name: '+ Add step' })).toBeInTheDocument()
  })

  it('keeps text typed into a step while its edit was saving', async () => {
    signedIn()
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    let patched = false
    // After the save, the refetch renames the recipe so the test can see it has landed.
    const saved: Recipe = { ...recipe, name: 'Soup v2', steps: [{ id: 3, text: 'Boil water fast' }] }
    server.use(
      http.patch('/api/recipes/7/steps/3', async () => {
        patched = true
        await gate
        return HttpResponse.json({ id: 3, text: 'Boil water fast' })
      }),
      http.get('/api/recipes/7', () => HttpResponse.json(patched ? saved : recipe)),
    )
    const user = userEvent.setup()
    renderWithProviders(<App />, { route: '/recipes/7/edit' })

    const field = await screen.findByDisplayValue('Boil water')
    await user.type(field, ' fast')
    await user.tab()
    await expect.poll(() => patched).toBe(true)
    await user.type(field, '!')
    release()

    expect(await screen.findByRole('link', { name: /Soup v2/ })).toBeInTheDocument()
    expect(field).toHaveValue('Boil water fast!')
    expect(field).toHaveAccessibleDescription('Unsaved')
  })
})

describe('ingredient editor when a save fails', () => {
  const lookup = { id: 1, name: 'leek' }
  const withIngredient: Recipe = {
    ...recipe,
    recipe_ingredients: [{ id: 5, ingredient: lookup, measurement: lookup, preparation: lookup, amount: 2 }],
  }

  beforeEach(() => {
    server.use(
      http.get('/api/cookbooks/', () => HttpResponse.json([])),
      http.get('/api/ingredients/', () => HttpResponse.json([lookup])),
      http.get('/api/measurements/', () => HttpResponse.json([lookup])),
      http.get('/api/preparations/', () => HttpResponse.json([lookup])),
    )
  })

  it('shows the error and keeps the edited amount', async () => {
    server.use(http.patch('/api/recipes/7/recipeingredients/5', failure))
    const user = userEvent.setup()
    renderWithProviders(<EditRecipeForm recipe={withIngredient} />)

    const amount = screen.getByLabelText('Amount')
    await user.type(amount, '5')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText(/Server unavailable/)).toBeInTheDocument()
    expect(amount).toHaveValue(25)
  })
})
