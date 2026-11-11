import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, expect, it } from 'vitest'

import App from '../App'
import type { RecipeCreate, RecipeDraft } from '../api/types'
import { renderWithProviders } from '../test/render'
import { passwordOnly, server, signedIn } from '../test/server'

const draft: RecipeDraft = {
  name: 'Leek soup',
  servings: 4,
  active_cook_time: 20,
  inactive_cook_time: 30,
  notes: 'Range 2-3 leeks: used 3.',
  ingredients: [
    { amount_numerator: 3, amount_denominator: 1, measurement: 'whole', ingredient: 'leek', preparation: 'sliced' },
    { amount_numerator: 1, amount_denominator: 2, measurement: 'Cup', ingredient: 'leek', preparation: null },
  ],
  requirements: ['Large pot'],
  steps: ['Sweat the leeks.', 'Simmer.'],
}

beforeEach(() => {
  signedIn()
  server.use(
    http.get('/api/auth/config', () => HttpResponse.json({ ...passwordOnly, recipe_import: true })),
    http.get('/api/cookbooks/', () => HttpResponse.json([])),
    http.get('/api/measurements/', () => HttpResponse.json([{ id: 2, name: 'cup' }])),
  )
})

async function readRecipe(text = 'Leek soup\n3 leeks, sliced') {
  const user = userEvent.setup()
  renderWithProviders(<App />, { route: '/' })
  await user.click(await screen.findByRole('button', { name: 'Import' }))
  await user.type(screen.getByLabelText('Recipe text'), text)
  await user.click(screen.getByRole('button', { name: 'Read recipe' }))
  return user
}

it('is offered only when import is set up', async () => {
  server.use(http.get('/api/auth/config', () => HttpResponse.json(passwordOnly)))
  renderWithProviders(<App />, { route: '/' })
  expect(await screen.findByRole('button', { name: 'New recipe' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Import' })).not.toBeInTheDocument()
})

it('reviews the draft beside the source and creates new lookups once on save', async () => {
  let sentText: unknown
  const created: Record<string, string[]> = { ingredients: [], measurements: [], preparations: [] }
  let saved: RecipeCreate | undefined
  server.use(
    http.post('/api/imports/text', async ({ request }) => {
      sentText = await request.json()
      return HttpResponse.json(draft)
    }),
    http.post('/api/recipes/', async ({ request }) => {
      saved = (await request.json()) as RecipeCreate
      return HttpResponse.json({ id: 7 }, { status: 201 })
    }),
    http.post('/api/:kind/', async ({ request, params }) => {
      const { name } = (await request.json()) as { name: string }
      const kind = String(params.kind)
      created[kind].push(name)
      return HttpResponse.json({ id: { ingredients: 10, measurements: 20, preparations: 30 }[kind], name }, { status: 201 })
    }),
    http.get('/api/recipes/7', () => HttpResponse.json({ detail: 'not under test' }, { status: 404 })),
  )
  const user = await readRecipe()

  expect(await screen.findByRole('heading', { name: 'Review import' })).toBeInTheDocument()
  expect(sentText).toEqual({ text: 'Leek soup\n3 leeks, sliced' })
  expect(within(screen.getByRole('complementary')).getByText(/3 leeks, sliced/)).toBeInTheDocument()
  expect(screen.getByLabelText('Name')).toHaveValue('Leek soup')
  expect(screen.getAllByText('New: “leek”, added when you save.', { exact: false })).toHaveLength(2)
  expect(screen.getAllByLabelText('Measurement')[1]).toHaveDisplayValue('cup')
  // "whole" is new too; the review can settle it with an existing row instead.
  await user.selectOptions(screen.getAllByLabelText('Measurement')[0], 'cup')
  expect(screen.getByDisplayValue('Sweat the leeks.')).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Save recipe' }))

  await waitFor(() => expect(saved).toBeDefined())
  expect(created).toEqual({ ingredients: ['leek'], measurements: [], preparations: ['sliced'] })
  expect(saved).toMatchObject({
    name: 'Leek soup',
    servings: 4,
    notes: 'Range 2-3 leeks: used 3.',
    requirements: [{ name: 'Large pot' }],
    steps: [{ text: 'Sweat the leeks.' }, { text: 'Simmer.' }],
    recipe_ingredients: [
      { ingredient_id: 10, measurement_id: 2, preparation_id: 30, amount_numerator: 3, amount_denominator: 1 },
      { ingredient_id: 10, measurement_id: 2, preparation_id: null, amount_numerator: 1, amount_denominator: 2 },
    ],
  })
  expect(saved?.recipe_ingredients?.[0]).not.toHaveProperty('pending')
  // Lands on the new recipe (its load is stubbed out).
  expect(await screen.findByText(/Couldn.t load this recipe/)).toBeInTheDocument()
})

it("can drop a pending name with Don't add", async () => {
  server.use(http.post('/api/imports/text', () => HttpResponse.json(draft)))
  const user = await readRecipe()
  await screen.findByRole('heading', { name: 'Review import' })

  const [first] = screen.getAllByText(/New: “sliced”/)
  await user.click(within(first).getByRole('button', { name: 'Don’t add' }))

  expect(screen.queryByText(/New: “sliced”/)).not.toBeInTheDocument()
})

it('warns when a recipe with that name exists', async () => {
  server.use(
    http.post('/api/imports/text', () => HttpResponse.json(draft)),
    http.get('/api/recipes/', () =>
      HttpResponse.json([
        {
          id: 3,
          name: 'LEEK SOUP',
          cookbook_id: null,
          cookbook_page: null,
          cookbook: null,
          active_cook_time: null,
          inactive_cook_time: null,
          created_at: '2026-01-01T00:00:00Z',
          tags: [],
          ingredient_names: [],
          step_count: 0,
        },
      ]),
    ),
  )
  const user = await readRecipe()

  expect(await screen.findByRole('link', { name: 'A recipe called “LEEK SOUP”' })).toHaveAttribute('href', '/recipes/3')
  await user.type(screen.getByLabelText('Name'), ' II')
  expect(screen.queryByRole('link', { name: /A recipe called/ })).not.toBeInTheDocument()
})

it('shows a failed parse and keeps the text', async () => {
  server.use(
    http.post('/api/imports/text', () =>
      HttpResponse.json({ detail: 'The recipe reader isn’t responding; try again' }, { status: 502 }),
    ),
  )
  await readRecipe('Leek soup')

  expect(await screen.findByText('The recipe reader isn’t responding; try again')).toBeInTheDocument()
  expect(screen.getByLabelText('Recipe text')).toHaveValue('Leek soup')
})
