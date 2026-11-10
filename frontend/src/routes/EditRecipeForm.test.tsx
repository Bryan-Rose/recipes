import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { Link, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'

import App from '../App'
import type { Recipe } from '../api/types'
import { renderWithProviders } from '../test/render'
import { server, signedIn } from '../test/server'
import { EditRecipeForm } from './EditRecipeForm'
import { RecipeEdit } from './RecipeEdit'

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

  it('explains a details save refused because a tag was deleted', async () => {
    server.use(http.patch('/api/recipes/7', () => HttpResponse.json({ detail: 'Unknown tag ids: [3]' }, { status: 409 })))
    const user = userEvent.setup()
    renderWithProviders(<EditRecipeForm recipe={recipe} />)

    await user.type(screen.getByLabelText('Name'), 'y')
    await user.click(screen.getByRole('button', { name: 'Save details' }))

    expect(await screen.findByText(/A tag you picked no longer exists/)).toBeInTheDocument()
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

  it('keeps an amount typed while a new ingredient is being saved', async () => {
    let release!: () => void
    const saved = new Promise<void>((resolve) => (release = resolve))
    const ingredients = [lookup]
    server.use(
      http.get('/api/ingredients/', () => HttpResponse.json(ingredients)),
      http.post('/api/ingredients/', async () => {
        await saved
        ingredients.push({ id: 2, name: 'onion' })
        return HttpResponse.json(ingredients[1], { status: 201 })
      }),
    )
    const user = userEvent.setup()
    renderWithProviders(<EditRecipeForm recipe={withIngredient} />)

    await user.click(await screen.findByRole('button', { name: '+ New ingredient' }))
    await user.type(screen.getByLabelText('New ingredient name'), 'onion')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await user.type(screen.getByLabelText('Amount'), '5')
    release()

    await waitFor(() => expect(screen.getByLabelText('Ingredient', { exact: true })).toHaveValue('2'))
    expect(screen.getByLabelText('Amount')).toHaveValue(25)
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

  it('loads the recipe tags, is clean until they change, and saves them', async () => {
    let sent: unknown
    server.use(
      http.get('/api/tags/', () => HttpResponse.json([{ id: 1, name: 'Dinner' }, { id: 2, name: 'Quick' }])),
      http.patch('/api/recipes/7', async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json(recipe)
      }),
    )
    const user = userEvent.setup()
    // Out of id order, as the API may return them; re-adding a removed tag must not count as a change.
    const tagged = { ...recipe, tags: [{ id: 2, name: 'Quick' }, { id: 1, name: 'Dinner' }] }
    renderWithProviders(<EditRecipeForm recipe={tagged} />)

    await user.click(await screen.findByRole('button', { name: 'Remove tag Quick' }))
    expect(screen.getByRole('button', { name: 'Save details' })).toBeEnabled()
    await user.selectOptions(screen.getByLabelText('Tag'), await screen.findByRole('option', { name: 'Quick' }))
    expect(screen.getByRole('button', { name: 'Save details' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Remove tag Dinner' }))
    await user.click(screen.getByRole('button', { name: 'Save details' }))

    await waitFor(() => expect(sent).toMatchObject({ tag_ids: [2] }))
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

describe('leaving the recipe editor', () => {
  const lookup = { id: 1, name: 'leek' }
  const withIngredient: Recipe = {
    ...recipe,
    recipe_ingredients: [{ id: 5, ingredient: lookup, measurement: lookup, preparation: null, amount_numerator: 2, amount_denominator: 1 }],
  }

  beforeEach(() => {
    server.use(
      http.get('/api/cookbooks/', () => HttpResponse.json([])),
      http.get('/api/ingredients/', () => HttpResponse.json([lookup])),
      http.get('/api/measurements/', () => HttpResponse.json([lookup])),
      http.get('/api/preparations/', () => HttpResponse.json([lookup])),
    )
  })

  function show() {
    renderWithProviders(
      <>
        <Link to="/">Nav home</Link>
        <Routes>
          <Route path="/recipes/7/edit" element={<EditRecipeForm recipe={withIngredient} />} />
          <Route path="/recipes/7" element={<p>Recipe page</p>} />
          <Route path="/" element={<p>Home page</p>} />
        </Routes>
      </>,
      { route: '/recipes/7/edit' },
    )
  }

  function mockConfirm(answer: boolean) {
    const spy = vi.spyOn(window, 'confirm').mockReturnValue(answer)
    onTestFinished(() => spy.mockRestore())
    return spy
  }

  type User = ReturnType<typeof userEvent.setup>
  const unsavedEdits: [string, (user: User) => Promise<void>][] = [
    ['an edited detail', (user) => user.type(screen.getByLabelText('Name'), 'y')],
    ['an edited ingredient', (user) => user.type(screen.getByLabelText('Amount'), '5')],
    [
      'a new ingredient',
      async (user) => {
        await user.click(screen.getByRole('button', { name: '+ Add ingredient' }))
        await user.type(screen.getAllByLabelText('Amount')[1], '5')
      },
    ],
    [
      'a new equipment item',
      async (user) => {
        await user.click(screen.getByRole('button', { name: '+ Add item' }))
        await user.keyboard('Pot')
      },
    ],
    [
      'a new step',
      async (user) => {
        await user.click(screen.getByRole('button', { name: '+ Add step' }))
        await user.keyboard('Stir')
      },
    ],
  ]
  const exits = [
    ['Done', 'button'],
    ['← Back to Soup', 'link'],
    ['Nav home', 'link'],
  ] as const

  it.each(unsavedEdits.flatMap(([what, edit]) => exits.map(([name, role]) => [what, name, role, edit] as const)))(
    'stays with %s on %s when discarding is cancelled',
    async (_what, name, role, edit) => {
      const confirm = mockConfirm(false)
      const user = userEvent.setup()
      show()

      await edit(user)
      await user.click(screen.getByRole(role, { name }))

      expect(confirm).toHaveBeenCalledWith('Discard unsaved changes?')
      expect(screen.getByRole('heading', { name: 'Edit recipe' })).toBeInTheDocument()
    },
  )

  it.each(exits)('leaves on %s once discarding is confirmed', async (name, role) => {
    mockConfirm(true)
    const user = userEvent.setup()
    show()

    await user.type(screen.getByLabelText('Name'), 'y')
    await user.click(screen.getByRole(role, { name }))

    expect(await screen.findByText(/Recipe page|Home page/)).toBeInTheDocument()
  })

  it('leaves without asking when nothing is unsaved', async () => {
    const confirm = mockConfirm(false)
    const user = userEvent.setup()
    show()

    // Opened but untouched new rows hold nothing to lose.
    await user.click(screen.getByRole('button', { name: '+ Add ingredient' }))
    await user.click(screen.getByRole('button', { name: '+ Add step' }))
    await user.click(screen.getByRole('button', { name: 'Done' }))

    expect(await screen.findByText('Recipe page')).toBeInTheDocument()
    expect(confirm).not.toHaveBeenCalled()
  })

  const unload = () => {
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    return event.defaultPrevented
  }

  it('warns on closing or reloading the tab only while something is unsaved', async () => {
    const user = userEvent.setup()
    show()

    expect(unload()).toBe(false)
    await user.type(screen.getByLabelText('Amount'), '5')
    expect(unload()).toBe(true)
  })

  it('warns on closing the tab mid-edit of a saved step, which has not blurred to save', async () => {
    const user = userEvent.setup()
    show()

    await user.type(screen.getByDisplayValue('Boil water'), '!')
    expect(unload()).toBe(true)
  })

  it('saves an edited step and leaves without asking, since leaving blurs it', async () => {
    const confirm = mockConfirm(false)
    let patched: unknown = null
    server.use(
      http.patch('/api/recipes/7/steps/3', async ({ request }) => {
        patched = await request.json()
        return HttpResponse.json({ id: 3, text: 'Boil water!' })
      }),
      http.get('/api/recipes/7', () => HttpResponse.json(withIngredient)),
    )
    const user = userEvent.setup()
    show()

    await user.type(screen.getByDisplayValue('Boil water'), '!')
    await user.click(screen.getByRole('button', { name: 'Done' }))

    expect(await screen.findByText('Recipe page')).toBeInTheDocument()
    expect(confirm).not.toHaveBeenCalled()
    await waitFor(() => expect(patched).toEqual({ text: 'Boil water!' }))
  })

  it('leaves without asking after saving a name with surrounding spaces', async () => {
    const confirm = mockConfirm(false)
    let saved = recipe
    server.use(
      http.patch('/api/recipes/7', async ({ request }) => {
        const body = (await request.json()) as { name: string }
        saved = { ...recipe, name: body.name.trim() }
        return HttpResponse.json(saved)
      }),
      http.get('/api/recipes/7', () => HttpResponse.json(saved)),
    )
    const user = userEvent.setup()
    // Through RecipeEdit, so the form gets the refetched recipe after the save.
    renderWithProviders(
      <Routes>
        <Route path="/recipes/:recipeId/edit" element={<RecipeEdit />} />
        <Route path="/recipes/7" element={<p>Recipe page</p>} />
      </Routes>,
      { route: '/recipes/7/edit' },
    )

    await user.type(await screen.findByLabelText('Name'), 'y ')
    await user.click(screen.getByRole('button', { name: 'Save details' }))
    await waitFor(() => expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Done' }))

    expect(await screen.findByText('Recipe page')).toBeInTheDocument()
    expect(confirm).not.toHaveBeenCalled()
  })

  it('does not ask on a ctrl-click of the back link, which opens a new tab', async () => {
    const confirm = mockConfirm(false)
    const user = userEvent.setup()
    show()

    await user.type(screen.getByLabelText('Name'), 'y')
    await user.keyboard('{Control>}')
    await user.click(screen.getByRole('link', { name: '← Back to Soup' }))
    await user.keyboard('{/Control}')

    expect(confirm).not.toHaveBeenCalled()
  })
})
