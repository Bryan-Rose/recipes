import { screen, waitFor } from '@testing-library/react'
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

  it('shows a failed details save without leaving an unhandled rejection', async () => {
    server.use(http.patch('/api/recipes/7', failure))
    const user = userEvent.setup()
    renderWithProviders(<EditRecipeForm recipe={recipe} />)

    await user.type(screen.getByLabelText('Name'), 'y')
    await user.click(screen.getByRole('button', { name: 'Save details' }))

    // Vitest fails the run on an unhandled rejection, so this also covers that.
    expect(await screen.findByText(/Server unavailable/)).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveValue('Soupy')
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
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    await user.type(field, ' and pepper')
    expect(field).toHaveValue('Add salt')
    release()

    expect(await screen.findByRole('button', { name: '+ Add step' })).toBeInTheDocument()
  })

  it('clears a failed step add when the new row is cancelled', async () => {
    server.use(http.post('/api/recipes/7/steps/', failure))
    const user = userEvent.setup()
    renderWithProviders(<EditRecipeForm recipe={recipe} />)

    await user.click(screen.getByRole('button', { name: '+ Add step' }))
    await user.keyboard('Add salt')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(await screen.findByText(/Server unavailable/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByText(/Server unavailable/)).not.toBeInTheDocument()
  })

  it('keeps a failed add on screen when another step is removed', async () => {
    let deleted = false
    server.use(
      http.post('/api/recipes/7/steps/', failure),
      http.delete('/api/recipes/7/steps/3', () => {
        deleted = true
        return new HttpResponse(null, { status: 204 })
      }),
      http.get('/api/recipes/7', () => HttpResponse.json(recipe)),
      http.get('/api/recipes/', () => HttpResponse.json([recipe])),
    )
    const user = userEvent.setup()
    renderWithProviders(<EditRecipeForm recipe={recipe} />)

    await user.click(screen.getByRole('button', { name: '+ Add step' }))
    await user.keyboard('Add salt')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(await screen.findByText(/Server unavailable/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Remove Method entry 1' }))
    await expect.poll(() => deleted).toBe(true)
    expect(screen.getByText(/Server unavailable/)).toBeInTheDocument()
  })

  it('keeps a failed step save on screen when a new row is cancelled', async () => {
    server.use(http.patch('/api/recipes/7/steps/3', failure))
    const user = userEvent.setup()
    renderWithProviders(<EditRecipeForm recipe={recipe} />)

    await user.type(screen.getByDisplayValue('Boil water'), ' fast')
    await user.click(screen.getByRole('button', { name: '+ Add step' }))
    expect(await screen.findByText(/Server unavailable/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByText(/Server unavailable/)).toBeInTheDocument()
    expect(screen.getByDisplayValue('Boil water fast')).toHaveAccessibleDescription('Unsaved')
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
    recipe_ingredients: [{ id: 5, ingredient: lookup, measurement: lookup, preparation: lookup, amount_numerator: 2, amount_denominator: 1 }],
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

  it('shows the error and keeps a new ingredient row', async () => {
    server.use(http.post('/api/recipes/7/recipeingredients/', failure))
    const user = userEvent.setup()
    renderWithProviders(<EditRecipeForm recipe={recipe} />)

    await user.click(screen.getByRole('button', { name: '+ Add ingredient' }))
    for (const label of ['Ingredient', 'Measurement', 'Preparation']) {
      const picker = screen.getByLabelText(label)
      await expect.poll(() => picker).toBeEnabled() // disabled until its options load
      await user.selectOptions(picker, 'leek')
    }
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByText(/Server unavailable/)).toBeInTheDocument()
    expect(screen.getByLabelText('Ingredient')).toHaveValue('1')
    expect(screen.getByRole('button', { name: 'Add' })).toBeEnabled()
  })

  it('clears a failed add when the new row is cancelled', async () => {
    server.use(http.post('/api/recipes/7/recipeingredients/', failure))
    const user = userEvent.setup()
    renderWithProviders(<EditRecipeForm recipe={recipe} />)

    await user.click(screen.getByRole('button', { name: '+ Add ingredient' }))
    for (const label of ['Ingredient', 'Measurement', 'Preparation']) {
      const picker = screen.getByLabelText(label)
      await expect.poll(() => picker).toBeEnabled() // disabled until its options load
      await user.selectOptions(picker, 'leek')
    }
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(await screen.findByText(/Server unavailable/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByText(/Server unavailable/)).not.toBeInTheDocument()
  })

  it('disables Cancel while a new ingredient is being added', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    server.use(
      http.post('/api/recipes/7/recipeingredients/', async () => {
        await gate
        return failure()
      }),
    )
    const user = userEvent.setup()
    renderWithProviders(<EditRecipeForm recipe={recipe} />)

    await user.click(screen.getByRole('button', { name: '+ Add ingredient' }))
    for (const label of ['Ingredient', 'Measurement', 'Preparation']) {
      const picker = screen.getByLabelText(label)
      await expect.poll(() => picker).toBeEnabled() // disabled until its options load
      await user.selectOptions(picker, 'leek')
    }
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await expect.poll(() => screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    release()

    expect(await screen.findByText(/Server unavailable/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled()
  })
})

describe('ingredient amounts and preparation', () => {
  const lookup = { id: 1, name: 'leek' }

  beforeEach(() => {
    server.use(
      http.get('/api/cookbooks/', () => HttpResponse.json([])),
      http.get('/api/ingredients/', () => HttpResponse.json([lookup])),
      http.get('/api/measurements/', () => HttpResponse.json([lookup])),
      http.get('/api/preparations/', () => HttpResponse.json([lookup])),
    )
  })

  it('shows a stored improper fraction as a whole number and a fraction', async () => {
    const withIngredient: Recipe = {
      ...recipe,
      recipe_ingredients: [
        { id: 5, ingredient: lookup, measurement: lookup, preparation: null, amount_numerator: 7, amount_denominator: 2 },
      ],
    }
    renderWithProviders(<EditRecipeForm recipe={withIngredient} />)

    expect(screen.getByLabelText('Amount')).toHaveValue(3)
    expect(screen.getByRole('combobox', { name: 'Fraction' })).toHaveDisplayValue('½')
    await expect.poll(() => screen.getByLabelText('Preparation')).toHaveDisplayValue('None') // once options load
  })

  it('posts "½" with an empty whole number and no preparation', async () => {
    let posted: unknown
    server.use(
      http.post('/api/recipes/7/recipeingredients/', async ({ request }) => {
        posted = await request.json()
        return failure()
      }),
    )
    const user = userEvent.setup()
    renderWithProviders(<EditRecipeForm recipe={recipe} />)

    await user.click(screen.getByRole('button', { name: '+ Add ingredient' }))
    for (const label of ['Ingredient', 'Measurement']) {
      const picker = screen.getByLabelText(label)
      await expect.poll(() => picker).toBeEnabled()
      await user.selectOptions(picker, 'leek')
    }
    await user.clear(screen.getByLabelText('Amount'))
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled() // 0 is not an amount
    await user.selectOptions(screen.getByRole('combobox', { name: 'Fraction' }), '½')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    await expect.poll(() => posted).toEqual({
      ingredient_id: 1,
      measurement_id: 1,
      preparation_id: null,
      amount_numerator: 1,
      amount_denominator: 2,
    })
  })
})

describe('recipe details form', () => {
  beforeEach(() => {
    server.use(http.get('/api/cookbooks/', () => HttpResponse.json([])))
  })

  it('loads notes and source, and sends them as null once cleared', async () => {
    let sent: unknown
    server.use(
      http.patch('/api/recipes/7', async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json(recipe)
      }),
    )
    const user = userEvent.setup()
    renderWithProviders(<EditRecipeForm recipe={{ ...recipe, notes: 'Halve the salt', source_url: 'https://example.com/soup' }} />)

    const source = screen.getByLabelText('Source URL')
    const notes = screen.getByLabelText('Notes')
    expect(source).toHaveValue('https://example.com/soup')
    expect(notes).toHaveValue('Halve the salt')

    await user.clear(source)
    await user.clear(notes)
    await user.click(screen.getByRole('button', { name: 'Save details' }))

    await waitFor(() => expect(sent).toMatchObject({ notes: null, source_url: null }))
  })
})

describe('reordering steps', () => {
  const twoSteps: Recipe = {
    ...recipe,
    steps: [
      { id: 3, text: 'Boil water' },
      { id: 4, text: 'Add pasta' },
    ],
  }

  beforeEach(() => {
    server.use(
      http.get('/api/cookbooks/', () => HttpResponse.json([])),
      http.get('/api/recipes/7', () => HttpResponse.json(twoSteps)),
    )
  })

  it('sends every step id in the new order', async () => {
    let sent: unknown
    server.use(
      http.put('/api/recipes/7/step-order', async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json([twoSteps.steps[1], twoSteps.steps[0]])
      }),
    )
    const user = userEvent.setup()
    renderWithProviders(<EditRecipeForm recipe={twoSteps} />)

    expect(screen.getByRole('button', { name: 'Move Method entry 1 up' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move Method entry 2 down' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Move Method entry 2 up' }))

    await waitFor(() => expect(sent).toEqual({ step_ids: [4, 3] }))
  })

  it('shows why a move failed', async () => {
    server.use(http.put('/api/recipes/7/step-order', failure))
    const user = userEvent.setup()
    renderWithProviders(<EditRecipeForm recipe={twoSteps} />)

    await user.click(screen.getByRole('button', { name: 'Move Method entry 1 down' }))

    expect(await screen.findByText(/Server unavailable/)).toBeInTheDocument()
  })

  it('explains a move refused because the steps changed elsewhere', async () => {
    server.use(
      http.put('/api/recipes/7/step-order', () =>
        HttpResponse.json({ detail: 'step_ids must list every step of the recipe exactly once' }, { status: 409 }),
      ),
    )
    const user = userEvent.setup()
    renderWithProviders(<EditRecipeForm recipe={twoSteps} />)

    await user.click(screen.getByRole('button', { name: 'Move Method entry 1 down' }))

    expect(await screen.findByText(/The steps changed since this page loaded/)).toBeInTheDocument()
    expect(screen.queryByText(/step_ids/)).not.toBeInTheDocument()
  })

  it('gives equipment no move buttons', () => {
    renderWithProviders(<EditRecipeForm recipe={{ ...twoSteps, requirements: [{ id: 9, name: 'Pot' }] }} />)

    expect(screen.queryByRole('button', { name: /Move You’ll need/ })).not.toBeInTheDocument()
  })
})
